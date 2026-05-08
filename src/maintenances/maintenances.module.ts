import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { envs } from '../config';
import {
  MAINTENANCES_SERVICE,
  USERS_SERVICE,
  VEHICLES_SERVICE,
} from '../config/services';
import { MaintenancesController } from './maintenances.controller';

@Module({
  controllers: [MaintenancesController],
  providers: [],
  imports: [
    ClientsModule.register([
      {
        name: MAINTENANCES_SERVICE,
        transport: Transport.TCP,
        options: {
          port: envs.maintenancesMsPort,
          host: envs.maintenancesMsHost,
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
        name: VEHICLES_SERVICE,
        transport: Transport.TCP,
        options: {
          port: envs.vehiclesMsPort,
          host: envs.vehiclesMsHost,
        },
      },
    ]),
  ],
})
export class MaintenancesModule {}
