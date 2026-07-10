import {
  Controller,
  Delete,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Patch,
  Param,
  Inject,
  ParseUUIDPipe,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { CreateUserDto, UpdateUserDto } from '@rideglory/contracts';
import { Public } from '../auth/decorators/public.decorator';
import { USERS_SERVICE } from '../config/services';
import { Request } from 'express';
import { AccountDeletionService } from './account-deletion.service';

type AuthenticatedRequest = Request & {
  user?: {
    uid?: string;
    email?: string;
  };
};

@Controller('users')
export class UsersController {
  constructor(
    @Inject(USERS_SERVICE) private readonly usersService: ClientProxy,
    private readonly accountDeletionService: AccountDeletionService,
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

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMe(@Req() request: AuthenticatedRequest): Promise<void> {
    const uid = request.user?.uid;
    const email = request.user?.email;
    if (!uid || !email) {
      throw new UnauthorizedException('Authenticated user uid and email are required');
    }

    await this.accountDeletionService.deleteAccount(uid, email);
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
