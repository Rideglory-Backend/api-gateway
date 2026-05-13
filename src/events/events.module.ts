import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { envs } from 'config/envs';
import { EVENTS_SERVICE, USERS_SERVICE } from 'config/services';
import { ClaudeService } from '../common/claude.service';
import { UnsplashService } from '../common/unsplash.service';

@Module({
  controllers: [EventsController],
  providers: [ClaudeService, UnsplashService],
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
export class EventsModule {}
