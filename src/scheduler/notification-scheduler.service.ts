import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { NotificationsService, NotificationType } from '../notifications/notifications.service';
import { VEHICLES_SERVICE, USERS_SERVICE, EVENTS_SERVICE, MAINTENANCES_SERVICE } from '../config/services';

interface SoatRecord {
  id: string;
  vehicleId: string;
  expiryDate: Date | string;
}

interface VehicleRecord {
  id: string;
  name: string;
  ownerId: string;
}

interface UserRecord {
  id: string;
  fcmToken?: string | null;
}

interface MaintenanceRecord {
  id: string;
  vehicleId: string;
  userId: string;
  name: string;
  nextDate: string | null;
  reminderSentAt?: string | null;
}

interface EventRecord {
  id: string;
  name: string;
}

const RPC_TIMEOUT_MS = 5_000;

/**
 * Sends SOAT expiry reminders, maintenance date reminders, and 24h event reminders.
 * All crons run in America/Bogota timezone (UTC-5).
 */
@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger('NotificationSchedulerService');

  constructor(
    private readonly notificationsService: NotificationsService,
    @Inject(VEHICLES_SERVICE)
    private readonly vehiclesService: ClientProxy,
    @Inject(USERS_SERVICE)
    private readonly usersService: ClientProxy,
    @Inject(EVENTS_SERVICE)
    private readonly eventsService: ClientProxy,
    @Inject(MAINTENANCES_SERVICE)
    private readonly maintenancesService: ClientProxy,
  ) {}

  // ── SOAT reminders ────────────────────────────────────────────────────────────

  /** Daily at 09:00 Bogota — SOAT expiring in 30 days */
  @Cron('0 9 * * *', { timeZone: 'America/Bogota' })
  async soatReminder30Days() {
    await this.sendSoatReminders(30, 'SOAT_30D');
  }

  /** Daily at 09:00 Bogota — SOAT expiring in 7 days */
  @Cron('0 9 * * *', { timeZone: 'America/Bogota' })
  async soatReminder7Days() {
    await this.sendSoatReminders(7, 'SOAT_7D');
  }

  /** Daily at 09:00 Bogota — SOAT expiring today */
  @Cron('0 9 * * *', { timeZone: 'America/Bogota' })
  async soatReminderDayOf() {
    await this.sendSoatReminders(0, 'SOAT_DAY_OF');
  }

  // ── Maintenance date reminders ────────────────────────────────────────────────

  /**
   * Daily at 09:00 Bogota — maintenance 30-day date-based reminder.
   * Queries maintenances where nextMaintenanceDate is ~30 days from today,
   * receiveDateAlert = true, and reminderSentAt IS NULL.
   */
  @Cron('0 9 * * *', { timeZone: 'America/Bogota' })
  async sendMaintenanceDateReminders() {
    this.logger.log('MAINTENANCE_DATE_REMINDER: starting cron run');

    let records: MaintenanceRecord[];
    try {
      records = await firstValueFrom<MaintenanceRecord[]>(
        this.maintenancesService
          .send('findMaintenancesDueSoon', { daysAhead: 30 })
          .pipe(timeout(RPC_TIMEOUT_MS)),
      );
    } catch (err: unknown) {
      this.logger.error(`MAINTENANCE_DATE_REMINDER: failed to fetch records: ${String(err)}`);
      return;
    }

    this.logger.log(`MAINTENANCE_DATE_REMINDER: found ${records.length} record(s)`);

    for (const record of records) {
      try {
        const user = await firstValueFrom<UserRecord>(
          this.usersService
            .send('findOneUser', { id: record.userId })
            .pipe(timeout(RPC_TIMEOUT_MS)),
        );

        await this.notificationsService.createNotification(
          user.id,
          'MAINTENANCE_DATE_REMINDER',
          { vehicleId: record.vehicleId, maintenanceId: record.id, maintenanceName: record.name, route: 'rideglory://maintenances' },
        );

        if (user.fcmToken) {
          await this.notificationsService.sendFcm(
            user.fcmToken,
            'Recordatorio de mantenimiento',
            `Tu mantenimiento "${record.name}" está programado en 30 días`,
            {
              type: 'MAINTENANCE_DATE_REMINDER',
              vehicleId: record.vehicleId,
              maintenanceId: record.id,
              route: 'rideglory://maintenances',
            },
          );
        }

        // Mark reminder sent to prevent re-fire
        await firstValueFrom(
          this.maintenancesService
            .send('markMaintenanceReminderSent', { maintenanceId: record.id })
            .pipe(timeout(RPC_TIMEOUT_MS)),
        );
      } catch (err: unknown) {
        this.logger.error(`MAINTENANCE_DATE_REMINDER: failed for record ${record.id}: ${String(err)}`);
      }
    }
  }

  // ── Event 24h reminders ───────────────────────────────────────────────────────

  /**
   * Every 15 minutes — 24h event reminder.
   * Finds events starting between now+23h55m and now+24h5m that haven't had
   * a reminder sent yet, then FCM multicasts to approved registrants.
   */
  @Cron('*/15 * * * *', { timeZone: 'America/Bogota' })
  async sendEventReminders() {
    const now = new Date();
    const fromDate = new Date(now.getTime() + (23 * 60 + 55) * 60_000);
    const toDate = new Date(now.getTime() + (24 * 60 + 5) * 60_000);

    let events: EventRecord[];
    try {
      events = await firstValueFrom<EventRecord[]>(
        this.eventsService
          .send('findEventsNeedingReminder', {
            fromDate: fromDate.toISOString(),
            toDate: toDate.toISOString(),
          })
          .pipe(timeout(RPC_TIMEOUT_MS)),
      );
    } catch (err: unknown) {
      this.logger.error(`EVENT_REMINDER: failed to fetch events: ${String(err)}`);
      return;
    }

    if (events.length === 0) {
      return;
    }

    this.logger.log(`EVENT_REMINDER: found ${events.length} event(s)`);

    for (const event of events) {
      try {
        // Fetch approved registrant user IDs
        const userIds = await firstValueFrom<string[]>(
          this.eventsService
            .send('getApprovedRegistrantUserIds', { eventId: event.id })
            .pipe(timeout(RPC_TIMEOUT_MS)),
        );

        // FCM multicast to each registrant
        for (const userId of userIds) {
          try {
            const user = await firstValueFrom<UserRecord>(
              this.usersService
                .send('findOneUser', { id: userId })
                .pipe(timeout(RPC_TIMEOUT_MS)),
            );

            await this.notificationsService.createNotification(userId, 'EVENT_REMINDER', {
              eventId: event.id,
              eventName: event.name,
              route: `rideglory://events/detail-by-id?id=${event.id}`,
            });

            if (user.fcmToken) {
              await this.notificationsService.sendFcm(
                user.fcmToken,
                'Recordatorio de rodada',
                `La rodada "${event.name}" comienza en 24 horas`,
                { type: 'EVENT_REMINDER', eventId: event.id, eventName: event.name, route: `rideglory://events/detail-by-id?id=${event.id}` },
              );
            }
          } catch {
            // Non-fatal — continue with next user
          }
        }

        // Mark event reminder sent
        await firstValueFrom(
          this.eventsService
            .send('markReminderSent', { eventId: event.id })
            .pipe(timeout(RPC_TIMEOUT_MS)),
        );
      } catch (err: unknown) {
        this.logger.error(`EVENT_REMINDER: failed for event ${event.id}: ${String(err)}`);
      }
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────────

  private async sendSoatReminders(
    daysUntilExpiry: number,
    type: NotificationType,
  ): Promise<void> {
    let soatRecords: SoatRecord[];

    try {
      soatRecords = await firstValueFrom<SoatRecord[]>(
        this.vehiclesService
          .send('findSoatsExpiringIn', { daysUntilExpiry })
          .pipe(timeout(RPC_TIMEOUT_MS)),
      );
    } catch (err: unknown) {
      this.logger.error(
        `${type}: failed to fetch SOAT records: ${String(err)}`,
      );
      return;
    }

    this.logger.log(`${type}: found ${soatRecords.length} SOAT(s) expiring`);

    for (const soat of soatRecords) {
      try {
        const vehicle = await firstValueFrom<VehicleRecord>(
          this.vehiclesService
            .send('getVehicleById', { vehicleId: soat.vehicleId })
            .pipe(timeout(RPC_TIMEOUT_MS)),
        );

        if (!vehicle) {
          this.logger.warn(
            `${type}: vehicle ${soat.vehicleId} not found — skipping`,
          );
          continue;
        }

        const user = await firstValueFrom<UserRecord>(
          this.usersService
            .send('findOneUser', { id: vehicle.ownerId })
            .pipe(timeout(RPC_TIMEOUT_MS)),
        );

        const payload = {
          vehicleId: vehicle.id,
          vehicleName: vehicle.name,
        };

        await this.notificationsService.createNotification(
          user.id,
          type,
          { ...payload, route: 'rideglory://garage' },
        );

        if (user.fcmToken) {
          const messages: Record<string, { title: string; body: string }> = {
            SOAT_30D: {
              title: 'Tu SOAT vence en 30 días',
              body: `El SOAT de tu moto ${vehicle.name} vence en 30 días. ¡Renuévalo a tiempo!`,
            },
            SOAT_7D: {
              title: 'Tu SOAT vence en 7 días',
              body: `El SOAT de tu moto ${vehicle.name} vence en 7 días. ¡No lo dejes para último momento!`,
            },
            SOAT_DAY_OF: {
              title: 'Tu SOAT vence hoy',
              body: `El SOAT de tu moto ${vehicle.name} vence hoy. Renuévalo cuanto antes.`,
            },
          };

          const msg = messages[type];
          if (msg?.title) {
            await this.notificationsService.sendFcm(
              user.fcmToken,
              msg.title,
              msg.body,
              { type, vehicleId: vehicle.id, vehicleName: vehicle.name, route: 'rideglory://garage' },
            );
          }
        }
      } catch (err: unknown) {
        this.logger.error(
          `${type}: failed for SOAT ${soat.id}: ${String(err)}`,
        );
      }
    }
  }
}
