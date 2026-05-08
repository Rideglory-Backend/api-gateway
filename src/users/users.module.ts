import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { envs, USERS_SERVICE } from 'config';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  controllers: [UsersController],
  providers: [],
  imports: [
    ClientsModule.register([
      {
        name: USERS_SERVICE,
        transport: Transport.TCP,
        options: {
          port: envs.usersMsPort,
          host: envs.usersMsHost,
        },
      },
    ])
  ],
})
export class UsersModule { }
