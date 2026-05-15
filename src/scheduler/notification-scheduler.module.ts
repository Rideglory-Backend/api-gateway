import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { envs } from '../config/envs';
import { VEHICLES_SERVICE, USERS_SERVICE, EVENTS_SERVICE, MAINTENANCES_SERVICE } from '../config/services';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationSchedulerService } from './notification-scheduler.service';

@Module({
  imports: [
    NotificationsModule,
    ClientsModule.register([
      {
        name: VEHICLES_SERVICE,
        transport: Transport.TCP,
        options: {
          port: envs.vehiclesMsPort,
          host: envs.vehiclesMsHost,
        },
      },
      {
        name: USERS_SERVICE,
        transport: Transport.TCP,
        options: {
          port: envs.usersMsPort,
          host: envs.usersMsHost,
        },
      },
      {
        name: EVENTS_SERVICE,
        transport: Transport.TCP,
        options: {
          port: envs.eventsMsPort,
          host: envs.eventsMsHost,
        },
      },
      {
        name: MAINTENANCES_SERVICE,
        transport: Transport.TCP,
        options: {
          port: envs.maintenancesMsPort,
          host: envs.maintenancesMsHost,
        },
      },
    ]),
  ],
  providers: [NotificationSchedulerService],
})
export class NotificationSchedulerModule {}
