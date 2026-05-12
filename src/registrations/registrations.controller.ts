import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { Request } from 'express';
import {
  CreateRegistrationDto,
  UpdateRegistrationDto,
} from '@rideglory/contracts';
import { EVENTS_SERVICE, USERS_SERVICE } from '../config/services';

type AuthenticatedRequest = Request & {
  user?: {
    uid: string;
    email?: string;
    token: unknown;
  };
};

const RPC_TIMEOUT_MS = 5_000;

@Controller()
export class RegistrationsController {
  constructor(
    @Inject(EVENTS_SERVICE) private readonly eventsService: ClientProxy,
    @Inject(USERS_SERVICE) private readonly usersService: ClientProxy,
  ) {}

  @Post('events/:eventId/registrations')
  async create(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() body: CreateRegistrationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const user = await this.getAuthenticatedUser(request);
    return firstValueFrom(
      this.eventsService
        .send('createRegistration', { ...body, eventId, userId: user.id })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  @Patch('registrations/:registrationId')
  async update(
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Body() body: UpdateRegistrationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const user = await this.getAuthenticatedUser(request);
    return firstValueFrom(
      this.eventsService
        .send('updateRegistration', {
          ...body,
          registrationId,
          userId: user.id,
        })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  @Post('registrations/:registrationId/cancel')
  async cancel(
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const user = await this.getAuthenticatedUser(request);
    return firstValueFrom(
      this.eventsService
        .send('cancelRegistration', { registrationId, userId: user.id })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  @Post('registrations/:registrationId/approve')
  async approve(
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
  ) {
    return firstValueFrom(
      this.eventsService
        .send('approveRegistration', { registrationId })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  @Post('registrations/:registrationId/reject')
  async reject(
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
  ) {
    return firstValueFrom(
      this.eventsService
        .send('rejectRegistration', { registrationId })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  @Post('registrations/:registrationId/ready-for-edit')
  async setReadyForEdit(
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
  ) {
    return firstValueFrom(
      this.eventsService
        .send('setRegistrationReadyForEdit', { registrationId })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  @Get('events/:eventId/registrations')
  async findByEvent(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return firstValueFrom(
      this.eventsService
        .send('getRegistrationsByEvent', { eventId })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  @Get('events/:eventId/registrations/me')
  async findMyRegistrationForEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const user = await this.getAuthenticatedUser(request);
    return firstValueFrom(
      this.eventsService
        .send('getMyRegistrationForEvent', { eventId, userId: user.id })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  @Get('registrations/me')
  async findMyRegistrations(@Req() request: AuthenticatedRequest) {
    const user = await this.getAuthenticatedUser(request);
    return firstValueFrom(
      this.eventsService
        .send('getMyRegistrations', { userId: user.id })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  private async getAuthenticatedUser(request: AuthenticatedRequest) {
    const email = request.user?.email;
    if (!email) {
      throw new UnauthorizedException(
        'Authenticated user email is required',
      );
    }

    const user = await firstValueFrom(
      this.usersService
        .send('findUserByEmail', { email })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
    return user as { id: string };
  }
}
