import { Module } from '@nestjs/common';
import { VehiclesModule } from './vehicles/vehicles.module';
import { EventsModule } from './events/events.module';

@Module({
  imports: [VehiclesModule, EventsModule],
  controllers: [],
  providers: [],
})
export class AppModule { }
