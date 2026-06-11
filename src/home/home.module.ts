import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { envs, EVENTS_SERVICE, USERS_SERVICE, VEHICLES_SERVICE } from 'config';
import { HomeController } from './home.controller';
import { ClsService } from 'nestjs-cls';
import { TracingSerializer } from '@rideglory/common-lib';

@Module({
  imports: [
    ClientsModule.registerAsync([
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
      {
        name: VEHICLES_SERVICE,
        inject: [ClsService],
        useFactory: (cls: ClsService) => ({
          transport: Transport.TCP,
          options: {
            port: envs.vehiclesMsPort,
            host: envs.vehiclesMsHost,
            serializer: new TracingSerializer(cls),
          },
        }),
      },
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
    ]),
  ],
  controllers: [HomeController],
})
export class HomeModule {}
