import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { envs, EVENTS_SERVICE, USERS_SERVICE, VEHICLES_SERVICE } from 'config';
import { HomeController } from './home.controller';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: USERS_SERVICE,
        transport: Transport.TCP,
        options: {
          port: envs.usersMsPort,
          host: envs.usersMsHost,
        },
      },
      {
        name: VEHICLES_SERVICE,
        transport: Transport.TCP,
        options: {
          port: envs.vehiclesMsPort,
          host: envs.vehiclesMsHost,
        },
      },
      {
        name: EVENTS_SERVICE,
        transport: Transport.TCP,
        options: {
          port: envs.eventsMsPort,
          host: envs.eventsMsHost,
        },
      },
    ]),
  ],
  controllers: [HomeController],
})
export class HomeModule {}
