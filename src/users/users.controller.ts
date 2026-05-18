import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Inject,
  ParseUUIDPipe,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { CreateUserDto, UpdateUserDto } from '@rideglory/contracts';
import { Public } from 'auth/decorators/public.decorator';
import { USERS_SERVICE } from 'config';
import { Request } from 'express';

type AuthenticatedRequest = Request & {
  user?: {
    email?: string;
  };
};

@Controller('users')
export class UsersController {
  constructor(
    @Inject(USERS_SERVICE) private readonly usersService: ClientProxy,
  ) {}

  @Post('sign-up')
  @Public()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.send('createUser', createUserDto);
  }

  @Get('me')
  findMe(@Req() request: AuthenticatedRequest) {
    const email = request.user?.email;
    if (!email) {
      throw new UnauthorizedException('Authenticated user email is required');
    }

    return this.usersService.send('findUserByEmail', { email });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.send('findOneUser', { id });
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.send('updateUser', { ...updateUserDto, id });
  }
}
