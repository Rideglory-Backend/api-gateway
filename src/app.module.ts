import { Module } from '@nestjs/common';
import { VehiclesModule } from './vehicles/vehicles.module';
import { EventsModule } from './events/events.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [AuthModule, VehiclesModule, EventsModule],
  controllers: [],
  providers: [],
})
export class AppModule { }
