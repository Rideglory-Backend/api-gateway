import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { envs } from 'config/envs';
import { EVENTS_SERVICE, USERS_SERVICE } from 'config/services';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TrackingBroadcaster } from './tracking-broadcaster.service';
import { TrackingGateway } from './tracking.gateway';
import { TrackingHttpController } from './tracking-http.controller';
import { TrackingNotificationsService } from './tracking-notifications.service';
import { TrackingRoomsService } from './tracking-rooms.service';
import { ClsService } from 'nestjs-cls';
import { TracingSerializer } from '@rideglory/common-lib';

// TODO(observability-phase2): WebSocket channel (/tracking/ws) does not
// carry x-request-id headers; tracing via WS events is out of scope for
// Phase 1.  Phase 2 (Sentry) should evaluate sentry-trace propagation over
// the WS protocol or fallback to session-level correlation.

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    ClientsModule.registerAsync([
      {
        name: EVENTS_SERVICE,
        inject: [ClsService],
        useFactory: (cls: ClsService) => ({
          transport: Transport.TCP,
          options: {
            host: envs.eventsMsHost,
            port: envs.eventsMsPort,
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
            host: envs.usersMsHost,
            port: envs.usersMsPort,
            serializer: new TracingSerializer(cls),
          },
        }),
      },
    ]),
  ],
  controllers: [TrackingHttpController],
  providers: [
    TrackingRoomsService,
    TrackingBroadcaster,
    TrackingGateway,
    TrackingNotificationsService,
  ],
  exports: [TrackingNotificationsService, TrackingBroadcaster],
})
export class TrackingModule {}
