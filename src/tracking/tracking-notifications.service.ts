import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { EVENTS_SERVICE, USERS_SERVICE } from '../config/services';
import { NotificationsService } from '../notifications/notifications.service';

type UserResult = { id: string; fcmToken?: string | null };
const RPC_TIMEOUT_MS = 5_000;

@Injectable()
export class TrackingNotificationsService {
  constructor(
    @Inject(EVENTS_SERVICE) private readonly eventsService: ClientProxy,
    @Inject(USERS_SERVICE) private readonly usersService: ClientProxy,
    private readonly notificationsService: NotificationsService,
  ) {}

  async sendEventEndedNotifications(eventId: string): Promise<void> {
    const userIds = await firstValueFrom<string[]>(
      this.eventsService
        .send('getApprovedRegistrantUserIds', { eventId })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
    for (const userId of userIds) {
      try {
        const user = await firstValueFrom<UserResult>(
          this.usersService
            .send('findOneUser', { id: userId })
            .pipe(timeout(RPC_TIMEOUT_MS)),
        );
        if (user.fcmToken) {
          await this.notificationsService.sendFcm(
            user.fcmToken,
            'La rodada ha terminado',
            'El organizador ha finalizado la rodada',
            {
              type: 'TRACKING_ENDED',
              eventId,
              route: `rideglory://events/detail-by-id?id=${eventId}`,
            },
          );
        }
      } catch {
        // Non-fatal — continue with other users
      }
    }
  }
}
