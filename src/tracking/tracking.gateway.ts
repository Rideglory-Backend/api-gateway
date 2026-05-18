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
import { EVENTS_SERVICE, USERS_SERVICE } from '../config/services';
import { NotificationsService } from '../notifications/notifications.service';
import { TrackingRoomsService } from './tracking-rooms.service';

type ClientMeta = { uid: string; dbUserId: string; eventId: string };

@Public()
@WebSocketGateway({ path: '/api/tracking/ws' })
export class TrackingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(TrackingGateway.name);
  private readonly clientMeta = new WeakMap<WebSocket, ClientMeta>();

  constructor(
    @Inject(EVENTS_SERVICE) private readonly eventsService: ClientProxy,
    @Inject(USERS_SERVICE) private readonly usersService: ClientProxy,
    private readonly firebaseAuthService: FirebaseAuthService,
    private readonly rooms: TrackingRoomsService,
    private readonly notificationsService: NotificationsService,
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
      const email = decoded.email;
      if (!email) {
        client.close(1008, 'Unauthorized');
        return;
      }
      const dbUser = await firstValueFrom<{ id: string }>(
        this.usersService
          .send('findUserByEmail', { email })
          .pipe(timeout(5_000)),
      );
      this.clientMeta.set(client, { uid: decoded.uid, dbUserId: dbUser.id, eventId });
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
      return;
    }
    if (type === 'tracking.sos') {
      await this.handleSos(client, meta, data);
    }
  }

  private async handleJoin(client: WebSocket, meta: ClientMeta, data: unknown) {
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
    if (typeof userId !== 'string' || userId !== meta.dbUserId) {
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

    const eventId =
      typeof payload.eventId === 'string' ? payload.eventId : meta.eventId;
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
            authUserId: meta.dbUserId,
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
            authUserId: meta.dbUserId,
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

  private async handleSos(client: WebSocket, meta: ClientMeta, data: unknown) {
    if (typeof data !== 'object' || data === null) {
      return;
    }
    const payload = data as Record<string, unknown>;
    const eventId =
      typeof payload.eventId === 'string' ? payload.eventId : meta.eventId;
    const userId =
      typeof payload.userId === 'string' ? payload.userId : meta.dbUserId;

    if (eventId !== meta.eventId) {
      return;
    }

    // Look up last known location from WS room state
    let latitude: number | null = null;
    let longitude: number | null = null;
    if (typeof payload.latitude === 'number') latitude = payload.latitude;
    if (typeof payload.longitude === 'number') longitude = payload.longitude;

    let sosResult: {
      triggered: boolean;
      fullName: string;
      phone?: string | null;
      latitude: number | null;
      longitude: number | null;
    };

    try {
      sosResult = await firstValueFrom(
        this.eventsService
          .send('markSosTriggered', { eventId, userId })
          .pipe(timeout(10_000)),
      );
    } catch (error) {
      this.logger.warn(`markSosTriggered failed: ${String(error)}`);
      return;
    }

    if (!sosResult.triggered) {
      // SOS already active — no-op
      return;
    }

    // Use location from WS payload since events-ms doesn't store live positions
    const resolvedLatitude = latitude ?? sosResult.latitude;
    const resolvedLongitude = longitude ?? sosResult.longitude;

    // Broadcast sos.alert to all room members
    this.broadcast(eventId, {
      type: 'tracking.sos.alert',
      data: {
        userId,
        fullName: sosResult.fullName,
        latitude: resolvedLatitude,
        longitude: resolvedLongitude,
        phone: sosResult.phone ?? undefined,
      },
    });

    // FCM multicast to approved registrants
    void this.sendSosFcmNotifications(
      eventId,
      userId,
      sosResult.fullName,
      resolvedLatitude,
      resolvedLongitude,
    ).catch((err: unknown) =>
      this.logger.warn(`SOS FCM multicast failed: ${String(err)}`),
    );
  }

  private async sendSosFcmNotifications(
    eventId: string,
    userId: string,
    fullName: string,
    latitude: number | null,
    longitude: number | null,
  ): Promise<void> {
    const userIds = await firstValueFrom<string[]>(
      this.eventsService
        .send('getApprovedRegistrantUserIds', { eventId })
        .pipe(timeout(10_000)),
    );

    for (const registrantUserId of userIds) {
      if (registrantUserId === userId) continue; // don't notify the SOS sender

      try {
        const user = await firstValueFrom<{ id: string; fcmToken?: string | null }>(
          this.usersService
            .send('findOneUser', { id: registrantUserId })
            .pipe(timeout(5_000)),
        );

        if (user.fcmToken) {
          await this.notificationsService.sendFcm(
            user.fcmToken,
            '¡Alerta SOS!',
            `${fullName} necesita ayuda urgente`,
            {
              type: 'SOS_ALERT',
              eventId,
              userId,
              fullName,
              latitude: String(latitude ?? ''),
              longitude: String(longitude ?? ''),
            },
          );
        }
      } catch {
        // Non-fatal — continue
      }
    }

    // Insert notification row
    await this.notificationsService.createNotification(userId, 'SOS_ALERT' as never, {
      eventId,
      userId,
    });
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
