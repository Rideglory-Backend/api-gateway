import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { envs } from 'config/envs';
import { EVENTS_SERVICE, USERS_SERVICE } from 'config/services';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TrackingBroadcaster } from './tracking-broadcaster.service';
import { TrackingGateway } from './tracking.gateway';
import { TrackingHttpController } from './tracking-http.controller';
import { TrackingRoomsService } from './tracking-rooms.service';

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    ClientsModule.register([
      {
        name: EVENTS_SERVICE,
        transport: Transport.TCP,
        options: {
          host: envs.eventsMsHost,
          port: envs.eventsMsPort,
        },
      },
      {
        name: USERS_SERVICE,
        transport: Transport.TCP,
        options: {
          host: envs.usersMsHost,
          port: envs.usersMsPort,
        },
      },
    ]),
  ],
  controllers: [TrackingHttpController],
  providers: [TrackingRoomsService, TrackingBroadcaster, TrackingGateway],
})
export class TrackingModule {}
