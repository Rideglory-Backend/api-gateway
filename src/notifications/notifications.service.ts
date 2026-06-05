import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { NOTIFICATIONS_SERVICE } from '../config/services';

export type NotificationType =
  | 'NEW_REGISTRATION'
  | 'REGISTRATION_APPROVED'
  | 'REGISTRATION_REJECTED'
  | 'SOAT_30D'
  | 'SOAT_7D'
  | 'SOAT_DAY_OF'
  | 'TECNOMECANICA_30D'
  | 'TECNOMECANICA_7D'
  | 'TECNOMECANICA_DAY_OF'
  | 'MAINTENANCE_DATE_REMINDER'
  | 'EVENT_REMINDER'
  | 'SOS_ALERT'
  | 'TRACKING_ENDED';

export interface NotificationPayload {
  [key: string]: string | number | boolean;
}

const RPC_TIMEOUT_MS = 5_000;

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(NOTIFICATIONS_SERVICE)
    private readonly notificationsClient: ClientProxy,
  ) {}

  async createNotification(
    userId: string,
    type: NotificationType,
    payload: NotificationPayload,
  ): Promise<void> {
    await firstValueFrom(
      this.notificationsClient
        .send('notification.create', { userId, type, data: payload })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  async listNotifications(
    userId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ data: object[]; nextCursor: string | null }> {
    return firstValueFrom(
      this.notificationsClient
        .send('notification.list', { userId, cursor, limit })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  async markRead(notificationId: string, userId: string): Promise<void> {
    await firstValueFrom(
      this.notificationsClient
        .send('notification.markRead', { notificationId, userId })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  async markAllRead(userId: string): Promise<void> {
    await firstValueFrom(
      this.notificationsClient
        .send('notification.markAllRead', { userId })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  async sendFcm(
    fcmToken: string,
    title: string,
    body: string,
    data: Record<string, string>,
  ): Promise<void> {
    await firstValueFrom(
      this.notificationsClient
        .send('notification.sendFcm', { fcmToken, title, body, data })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }
}
