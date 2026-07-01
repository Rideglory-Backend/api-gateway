import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { envs } from '../config/envs';
import {
  VEHICLES_SERVICE,
  USERS_SERVICE,
  EVENTS_SERVICE,
  MAINTENANCES_SERVICE,
} from '../config/services';
import { NotificationsModule } from '../notifications/notifications.module';
import { TrackingModule } from '../tracking/tracking.module';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { ClsService } from 'nestjs-cls';
import { TracingSerializer } from '@rideglory/common-lib';

@Module({
  imports: [
    NotificationsModule,
    TrackingModule,
    ClientsModule.registerAsync([
      {
        name: VEHICLES_SERVICE,
        inject: [ClsService],
        useFactory: (cls: ClsService) => ({
          transport: Transport.TCP,
          options: {
            port: envs.vehiclesMsPort,
            host: envs.vehiclesMsHost,
            serializer: new TracingSerializer(cls),
          },
        }),
      },
      {
        name: USERS_SERVICE,
        inject: [ClsService],
        useFactory: (cls: ClsService) => ({
          transport: Transport.TCP,
          options: {
            port: envs.usersMsPort,
            host: envs.usersMsHost,
            serializer: new TracingSerializer(cls),
          },
        }),
      },
      {
        name: EVENTS_SERVICE,
        inject: [ClsService],
        useFactory: (cls: ClsService) => ({
          transport: Transport.TCP,
          options: {
            port: envs.eventsMsPort,
            host: envs.eventsMsHost,
            serializer: new TracingSerializer(cls),
          },
        }),
      },
      {
        name: MAINTENANCES_SERVICE,
        inject: [ClsService],
        useFactory: (cls: ClsService) => ({
          transport: Transport.TCP,
          options: {
            port: envs.maintenancesMsPort,
            host: envs.maintenancesMsHost,
            serializer: new TracingSerializer(cls),
          },
        }),
      },
    ]),
  ],
  providers: [NotificationSchedulerService],
})
export class NotificationSchedulerModule {}
