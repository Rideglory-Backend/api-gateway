import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { HttpLoggerMiddleware } from './common/middleware/http-logger.middleware';
import { ScheduleModule } from '@nestjs/schedule';
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

@Module({
  imports: [
    ScheduleModule.forRoot(),
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
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpLoggerMiddleware).forRoutes('*');
  }
}
