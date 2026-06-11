import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { envs } from '../config';
import {
  MAINTENANCES_SERVICE,
  USERS_SERVICE,
  VEHICLES_SERVICE,
} from '../config/services';
import { MaintenancesController } from './maintenances.controller';
import { ClsService } from 'nestjs-cls';
import { TracingSerializer } from '@rideglory/common-lib';

@Module({
  controllers: [MaintenancesController],
  providers: [],
  imports: [
    ClientsModule.registerAsync([
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
    ]),
  ],
})
export class MaintenancesModule {}
