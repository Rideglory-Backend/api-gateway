import { Module } from '@nestjs/common';
import { VehiclesController } from './vehicles.controller';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  MAINTENANCES_SERVICE,
  USERS_SERVICE,
  VEHICLES_SERVICE,
} from '../config/services';
import { envs } from '../config/envs';

@Module({
  controllers: [VehiclesController],
  providers: [],
  imports: [
    ClientsModule.register([
      {
        name: VEHICLES_SERVICE,
        transport: Transport.TCP,
        options: {
          port: envs.vehiclesMsPort,
          host: envs.vehiclesMsHost,
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
      {
        name: MAINTENANCES_SERVICE,
        transport: Transport.TCP,
        options: {
          port: envs.maintenancesMsPort,
          host: envs.maintenancesMsHost,
        },
      },
    ])
  ],
})
export class VehiclesModule { }
