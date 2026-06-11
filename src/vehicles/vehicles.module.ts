import { Module } from '@nestjs/common';
import { VehiclesController } from './vehicles.controller';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  MAINTENANCES_SERVICE,
  USERS_SERVICE,
  VEHICLES_SERVICE,
} from '../config/services';
import { envs } from '../config/envs';
import { ClsService } from 'nestjs-cls';
import { TracingSerializer } from '@rideglory/common-lib';

@Module({
  controllers: [VehiclesController],
  providers: [],
  imports: [
    ClientsModule.registerAsync([
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
        name: MAINTENANCES_SERVICE,
        inject: [ClsService],
        useFactory: (cls: ClsService) => ({
          transport: Transport.TCP,
          options: {
            port: envs.maintenancesMsPort,
            host: envs.maintenancesMsHost,
            serializer: new TracingSerializer(cls),
          },
        }),
      },
    ]),
  ],
})
export class VehiclesModule {}
