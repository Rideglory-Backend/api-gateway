import { Module } from '@nestjs/common';
import { VehiclesModule } from './vehicles/vehicles.module';
import { EventsModule } from './events/events.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HomeModule } from './home/home.module';
import { MaintenancesModule } from './maintenances/maintenances.module';
import { TrackingModule } from './tracking/tracking.module';
import { RegistrationsModule } from './registrations/registrations.module';
import { PlacesModule } from './places/places.module';

@Module({
  imports: [
    AuthModule,
    VehiclesModule,
    EventsModule,
    TrackingModule,
    RegistrationsModule,
    PlacesModule,
    UsersModule,
    MaintenancesModule,
    HomeModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
