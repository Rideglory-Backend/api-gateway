import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { WebSocket } from 'ws';
import { EVENTS_SERVICE } from '../config/services';
import { TrackingRoomsService } from './tracking-rooms.service';

@Injectable()
export class TrackingBroadcaster {
  constructor(
    @Inject(EVENTS_SERVICE) private readonly eventsService: ClientProxy,
    private readonly rooms: TrackingRoomsService,
  ) {}

  async broadcastSnapshot(eventId: string): Promise<void> {
    const riders = await firstValueFrom(
      this.eventsService
        .send('trackingSnapshot', { eventId })
        .pipe(timeout(10_000)),
    );
    this.broadcastRaw(
      eventId,
      JSON.stringify({ type: 'tracking.snapshot', data: { riders } }),
    );
  }

  broadcastRiderLeft(eventId: string, userId: string): void {
    this.broadcastRaw(
      eventId,
      JSON.stringify({ type: 'tracking.rider.left', data: { userId } }),
    );
  }

  private broadcastRaw(eventId: string, raw: string): void {
    for (const client of this.rooms.getClients(eventId)) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(raw);
      }
    }
  }
}
