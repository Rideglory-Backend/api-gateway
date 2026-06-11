import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { envs, USERS_SERVICE } from 'config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ClsService } from 'nestjs-cls';
import { TracingSerializer } from '@rideglory/common-lib';

@Module({
  controllers: [UsersController],
  providers: [],
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
    ]),
  ],
})
export class UsersModule {}
