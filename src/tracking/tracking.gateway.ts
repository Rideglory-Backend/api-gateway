import { Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import type { IncomingMessage } from 'http';
import type { RawData } from 'ws';
import { WebSocket } from 'ws';
import { Public } from '../auth/decorators/public.decorator';
import { FirebaseAuthService } from '../auth/firebase-auth.service';
import { EVENTS_SERVICE } from '../config/services';
import { TrackingRoomsService } from './tracking-rooms.service';

type ClientMeta = { uid: string; eventId: string };

@Public()
@WebSocketGateway({ path: '/api/tracking/ws' })
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(TrackingGateway.name);
  private readonly clientMeta = new WeakMap<WebSocket, ClientMeta>();

  constructor(
    @Inject(EVENTS_SERVICE) private readonly eventsService: ClientProxy,
    private readonly firebaseAuthService: FirebaseAuthService,
    private readonly rooms: TrackingRoomsService,
  ) {}

  handleConnection(client: WebSocket, ...args: unknown[]) {
    const request = args[0] as IncomingMessage | undefined;
    if (!request?.url) {
      client.close(1008, 'Missing handshake');
      return;
    }

    const baseUrl = `http://${request.headers.host ?? 'localhost'}`;
    const url = new URL(request.url, baseUrl);
    const token = url.searchParams.get('token');
    const eventId = url.searchParams.get('eventId');

    if (!token || !eventId) {
      client.close(1008, 'Missing token or eventId');
      return;
    }

    void this.authenticateAndRegister(client, token, eventId);
  }

  handleDisconnect(client: WebSocket) {
    const meta = this.clientMeta.get(client);
    if (meta) {
      this.rooms.removeClient(meta.eventId, client);
      this.clientMeta.delete(client);
    }
  }

  private async authenticateAndRegister(
    client: WebSocket,
    token: string,
    eventId: string,
  ) {
    try {
      const decoded = await this.firebaseAuthService.verifyToken(token);
      this.clientMeta.set(client, { uid: decoded.uid, eventId });
      this.rooms.addClient(eventId, client);
      this.attachMessageHandler(client);
      await this.sendSnapshotToClient(client, eventId);
    } catch (error) {
      this.logger.warn(`Tracking WS auth failed: ${String(error)}`);
      client.close(1008, 'Unauthorized');
    }
  }

  private attachMessageHandler(client: WebSocket) {
    client.on('message', (raw: RawData) => {
      void this.onClientMessage(client, raw);
    });
  }

  private async onClientMessage(client: WebSocket, raw: RawData) {
    const meta = this.clientMeta.get(client);
    if (!meta) {
      return;
    }

    let parsed: unknown;
    try {
      const text = typeof raw === 'string' ? raw : raw.toString();
      parsed = JSON.parse(text) as unknown;
    } catch {
      return;
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return;
    }

    const envelope = parsed as { type?: unknown; data?: unknown };
    const type = envelope.type;
    const data = envelope.data;

    if (type === 'tracking.join') {
      await this.handleJoin(client, meta, data);
      return;
    }
    if (type === 'tracking.location.update') {
      await this.handleLocationUpdate(client, meta, data);
      return;
    }
    if (type === 'tracking.leave') {
      await this.handleLeave(client, meta, data);
    }
  }

  private async handleJoin(
    client: WebSocket,
    meta: ClientMeta,
    data: unknown,
  ) {
    if (typeof data === 'object' && data !== null && 'eventId' in data) {
      const joinEventId = (data as { eventId?: unknown }).eventId;
      if (typeof joinEventId === 'string' && joinEventId !== meta.eventId) {
        return;
      }
    }
    await this.sendSnapshotToClient(client, meta.eventId);
  }

  private async handleLocationUpdate(
    client: WebSocket,
    meta: ClientMeta,
    data: unknown,
  ) {
    if (typeof data !== 'object' || data === null) {
      return;
    }
    const payload = data as Record<string, unknown>;
    const userId = payload.userId;
    if (typeof userId !== 'string' || userId !== meta.uid) {
      return;
    }

    const latitude = Number(payload.latitude);
    const longitude = Number(payload.longitude);
    const speedKmh = Number(payload.speedKmh);
    const distanceMeters = Number(payload.distanceMeters);
    const batteryPercent = Number(payload.batteryPercent);
    if (
      Number.isNaN(latitude) ||
      Number.isNaN(longitude) ||
      Number.isNaN(speedKmh) ||
      Number.isNaN(distanceMeters) ||
      Number.isNaN(batteryPercent)
    ) {
      return;
    }

    const eventId = typeof payload.eventId === 'string' ? payload.eventId : meta.eventId;
    if (eventId !== meta.eventId) {
      return;
    }

    try {
      const rider = await firstValueFrom(
        this.eventsService
          .send('trackingUpdateLocation', {
            eventId,
            userId,
            latitude,
            longitude,
            speedKmh,
            distanceMeters,
            batteryPercent: Math.trunc(batteryPercent),
            authUserId: meta.uid,
          })
          .pipe(timeout(10_000)),
      );
      this.broadcast(meta.eventId, {
        type: 'tracking.rider.updated',
        data: rider,
      });
    } catch (error) {
      this.logger.warn(`trackingUpdateLocation failed: ${String(error)}`);
    }
  }

  private async handleLeave(
    client: WebSocket,
    meta: ClientMeta,
    data: unknown,
  ) {
    if (typeof data !== 'object' || data === null) {
      return;
    }
    const payload = data as Record<string, unknown>;
    const userId = payload.userId;
    const eventId =
      typeof payload.eventId === 'string' ? payload.eventId : meta.eventId;
    if (typeof userId !== 'string' || eventId !== meta.eventId) {
      return;
    }

    try {
      await firstValueFrom(
        this.eventsService
          .send('trackingStopSession', {
            eventId,
            userId,
            authUserId: meta.uid,
          })
          .pipe(timeout(10_000)),
      );
    } catch (error) {
      this.logger.warn(`trackingStopSession on leave failed: ${String(error)}`);
    }

    this.broadcast(meta.eventId, {
      type: 'tracking.rider.left',
      data: { userId },
    });
    this.rooms.removeClient(meta.eventId, client);
    this.clientMeta.delete(client);
    if (client.readyState === WebSocket.OPEN) {
      client.close();
    }
  }

  private async sendSnapshotToClient(client: WebSocket, eventId: string) {
    try {
      const riders = await firstValueFrom(
        this.eventsService
          .send('trackingSnapshot', { eventId })
          .pipe(timeout(10_000)),
      );
      this.safeSend(client, {
        type: 'tracking.snapshot',
        data: { riders },
      });
    } catch (error) {
      this.logger.warn(`trackingSnapshot failed: ${String(error)}`);
    }
  }

  private broadcast(eventId: string, message: unknown) {
    const raw = JSON.stringify(message);
    for (const peer of this.rooms.getClients(eventId)) {
      this.safeSendRaw(peer, raw);
    }
  }

  private safeSend(client: WebSocket, message: unknown) {
    this.safeSendRaw(client, JSON.stringify(message));
  }

  private safeSendRaw(client: WebSocket, raw: string) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(raw);
    }
  }
}
