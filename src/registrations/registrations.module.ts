import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { envs } from 'config/envs';
import { EVENTS_SERVICE, USERS_SERVICE } from 'config/services';
import { RegistrationsController } from './registrations.controller';

@Module({
  controllers: [RegistrationsController],
  providers: [],
  imports: [
    ClientsModule.register([
      {
        name: EVENTS_SERVICE,
        transport: Transport.TCP,
        options: {
          port: envs.eventsMsPort,
          host: envs.eventsMsHost,
        },
      },
      {
        name: USERS_SERVICE,
        transport: Transport.TCP,
        options: {
          port: envs.usersMsPort,
          host: envs.usersMsHost,
        },
      },
    ]),
  ],
})
export class RegistrationsModule {}
