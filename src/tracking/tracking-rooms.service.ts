import { Injectable } from '@nestjs/common';
import type { WebSocket } from 'ws';

@Injectable()
export class TrackingRoomsService {
  private readonly clientsByEvent = new Map<string, Set<WebSocket>>();

  addClient(eventId: string, client: WebSocket) {
    let set = this.clientsByEvent.get(eventId);
    if (!set) {
      set = new Set();
      this.clientsByEvent.set(eventId, set);
    }
    set.add(client);
  }

  removeClient(eventId: string, client: WebSocket) {
    const set = this.clientsByEvent.get(eventId);
    if (!set) {
      return;
    }
    set.delete(client);
    if (set.size === 0) {
      this.clientsByEvent.delete(eventId);
    }
  }

  getClients(eventId: string): ReadonlySet<WebSocket> {
    return this.clientsByEvent.get(eventId) ?? new Set();
  }
}
