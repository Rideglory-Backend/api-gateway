import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { getMessaging } from 'firebase-admin/messaging';

export type NotificationType =
  | 'NEW_REGISTRATION'
  | 'REGISTRATION_APPROVED'
  | 'REGISTRATION_REJECTED'
  | 'SOAT_30D'
  | 'SOAT_7D'
  | 'SOAT_DAY_OF'
  | 'MAINTENANCE_DATE_REMINDER'
  | 'EVENT_REMINDER'
  | 'SOS_ALERT'
  | 'TRACKING_ENDED';

export interface NotificationPayload {
  [key: string]: string | number | boolean;
}

@Injectable()
export class NotificationsService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger('NotificationsService');

  constructor() {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is not set for api-gateway');
    }
    super({
      adapter: new PrismaPg({ connectionString: url }),
    });
    this.logger.log('Notifications DB connected');
  }

  async onModuleInit() {
    await this.$connect();
  }

  // ── Notification CRUD ────────────────────────────────────────────────────────

  async createNotification(
    userId: string,
    type: NotificationType,
    payload: NotificationPayload,
  ) {
    return this.notification.create({
      data: { userId, type, payload },
    });
  }

  async listNotifications(
    userId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ data: object[]; nextCursor: string | null }> {
    const take = Math.min(limit, 50);

    const items = await this.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
    });

    const hasMore = items.length > take;
    const data = hasMore ? items.slice(0, take) : items;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return { data, nextCursor };
  }

  async markRead(notificationId: string, userId: string): Promise<void> {
    const notification = await this.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException(
        `Notification ${notificationId} not found`,
      );
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('Cannot mark another user\'s notification as read');
    }

    await this.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  // ── FCM helpers ──────────────────────────────────────────────────────────────

  async sendFcm(
    fcmToken: string,
    title: string,
    body: string,
    data: Record<string, string>,
  ): Promise<void> {
    try {
      await getMessaging().send({
        token: fcmToken,
        notification: { title, body },
        data,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`FCM send failed: ${message}`);
    }
  }
}
