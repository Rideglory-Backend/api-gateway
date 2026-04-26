import { Module } from '@nestjs/common';
import { VehiclesController } from './vehicles.controller';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { VEHICLES_SERVICE } from '../config/services';
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
    ])
  ],
})
export class VehiclesModule { }
