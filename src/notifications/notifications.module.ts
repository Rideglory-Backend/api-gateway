import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { envs } from '../config/envs';
import { USERS_SERVICE, NOTIFICATIONS_SERVICE } from '../config/services';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { ClsService } from 'nestjs-cls';
import { TracingSerializer } from '@rideglory/common-lib';

@Module({
  imports: [
    ClientsModule.registerAsync([
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
        name: NOTIFICATIONS_SERVICE,
        inject: [ClsService],
        useFactory: (cls: ClsService) => ({
          transport: Transport.TCP,
          options: {
            port: envs.notificationsMsPort,
            host: envs.notificationsMsHost,
            serializer: new TracingSerializer(cls),
          },
        }),
      },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
