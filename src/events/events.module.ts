import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { envs } from 'config/envs';
import { EVENTS_SERVICE, USERS_SERVICE } from 'config/services';
import { ClsService } from 'nestjs-cls';
import { TracingSerializer } from '@rideglory/common-lib';

@Module({
  controllers: [EventsController],
  providers: [],
  imports: [
    ClientsModule.registerAsync([
      {
        name: EVENTS_SERVICE,
        inject: [ClsService],
        useFactory: (cls: ClsService) => ({
          transport: Transport.TCP,
          options: {
            port: envs.eventsMsPort,
            host: envs.eventsMsHost,
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
            port: envs.usersMsPort,
            host: envs.usersMsHost,
            serializer: new TracingSerializer(cls),
          },
        }),
      },
    ]),
  ],
})
export class EventsModule {}
