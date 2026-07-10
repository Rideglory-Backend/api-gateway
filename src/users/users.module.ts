import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { AccountDeletionService } from './account-deletion.service';
import { envs, MAINTENANCES_SERVICE, USERS_SERVICE, VEHICLES_SERVICE } from '../config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ClsService } from 'nestjs-cls';
import { TracingSerializer } from '@rideglory/common-lib';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';

@Module({
  controllers: [UsersController],
  providers: [AccountDeletionService],
  imports: [
    AuthModule,
    AiModule,
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
export class UsersModule {}
