import { Module } from '@nestjs/common';
import { VehiclesModule } from './vehicles/vehicles.module';
import { EventsModule } from './events/events.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HomeModule } from './home/home.module';

@Module({
  imports: [AuthModule, VehiclesModule, EventsModule, UsersModule, HomeModule],
  controllers: [],
  providers: [],
})
export class AppModule { }
