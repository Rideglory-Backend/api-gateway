import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ClsModule, ClsService } from 'nestjs-cls';
import { VehiclesModule } from './vehicles/vehicles.module';
import { EventsModule } from './events/events.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HomeModule } from './home/home.module';
import { MaintenancesModule } from './maintenances/maintenances.module';
import { TrackingModule } from './tracking/tracking.module';
import { RegistrationsModule } from './registrations/registrations.module';
import { PlacesModule } from './places/places.module';
import { NotificationsModule } from './notifications/notifications.module';
import { NotificationSchedulerModule } from './scheduler/notification-scheduler.module';
import { HealthModule } from './health/health.module';
import { AiModule } from './ai/ai.module';
import { PiiRedactInterceptor, pinoHttpOptions } from '@rideglory/common-lib';
import { HttpLoggingInterceptor } from './common/interceptors/http-logging.interceptor';

type IncomingRequest = { headers: Record<string, string | undefined> };

function resolveTraceId(req: IncomingRequest): string {
  const xRequestId = req.headers['x-request-id'];
  if (xRequestId) return xRequestId;
  const sentryTrace = req.headers['sentry-trace'];
  if (sentryTrace) return sentryTrace.split('-')[0];
  return crypto.randomUUID();
}

@Module({
  imports: [
    ScheduleModule.forRoot(),
    LoggerModule.forRootAsync({
      useFactory: () => pinoHttpOptions('ApiGateway'),
    }),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: resolveTraceId,
        // Also seed the named key 'traceId' so cls.get('traceId') works
        // consistently across HttpLoggingInterceptor, RpcCustomExceptionFilter,
        // and TracingSerializer. cls.getId() and cls.get('traceId') are kept
        // in sync by this setup hook — single source of truth.
        setup: (cls: ClsService, req: IncomingRequest) => {
          cls.set('traceId', resolveTraceId(req));
          const sentryTrace = req.headers['sentry-trace'];
          if (sentryTrace) cls.set('sentryTrace', sentryTrace);
          const baggage = req.headers['baggage'];
          if (baggage) cls.set('baggage', baggage);
        },
      },
    }),
    AuthModule,
    VehiclesModule,
    EventsModule,
    TrackingModule,
    RegistrationsModule,
    PlacesModule,
    UsersModule,
    MaintenancesModule,
    HomeModule,
    NotificationsModule,
    NotificationSchedulerModule,
    HealthModule,
    AiModule,
  ],
  controllers: [],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: PiiRedactInterceptor },
    { provide: APP_INTERCEPTOR, useClass: HttpLoggingInterceptor },
  ],
})
export class AppModule {}
