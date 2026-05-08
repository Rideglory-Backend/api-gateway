import { Controller, Get, Post, Body, Patch, Param, Delete, Inject, ParseUUIDPipe, Req, UnauthorizedException } from '@nestjs/common';
import { CreateEventDto, UpdateEventDto } from '@rideglory/contracts';
import { ClientProxy } from '@nestjs/microservices';
import { EVENTS_SERVICE, USERS_SERVICE } from '../config/services';
import { firstValueFrom } from 'rxjs';
import { Request } from 'express';


type AuthenticatedRequest = Request & {
  user?: {
    email?: string;
  };
};

@Controller('events')
export class EventsController {
  constructor(
    @Inject(EVENTS_SERVICE) private readonly eventsService: ClientProxy,
    @Inject(USERS_SERVICE) private readonly usersService: ClientProxy,
  ) { }

  @Post()
  create(@Body() createEventDto: CreateEventDto) {
    return this.eventsService.send('createEvent', createEventDto);
  }

  @Get()
  findAll() {
    return this.eventsService.send('findAllEvents', {});
  }

  @Get('my')
  async findMyEvents(@Req() request: AuthenticatedRequest) {
    const user = await this.getAuthenticatedUser(request);
    return this.eventsService.send('findEventsByOwnerId', { ownerId: user.id });
  }

  @Get('upcoming')
  findUpcoming() {
    return this.eventsService.send('findUpcomingEvents', { limit: 5 });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.send('findOneEvent', id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() updateEventDto: UpdateEventDto) {
    return this.eventsService.send('updateEvent', { ...updateEventDto, id });
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.send('removeEvent', id);
  }

  private async getAuthenticatedUser(request: AuthenticatedRequest) {
    const email = request.user?.email;
    if (!email) {
      throw new UnauthorizedException('Authenticated user email is required');
    }

    return firstValueFrom(this.usersService.send('findUserByEmail', { email }));
  }
}
