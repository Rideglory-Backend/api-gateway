import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Inject,
  ParseUUIDPipe,
  Req,
  UnauthorizedException,
  Query,
} from '@nestjs/common';
import {
  CreateEventDto,
  EventFilterDto,
  UpdateEventDto,
} from '@rideglory/contracts';
import { ClientProxy } from '@nestjs/microservices';
import { EVENTS_SERVICE, USERS_SERVICE } from '../config/services';
import { firstValueFrom } from 'rxjs';
import { Request } from 'express';
import { ClaudeService } from '../common/claude.service';
import { UnsplashService } from '../common/unsplash.service';
import { GenerateCoverDto } from './dto/generate-cover.dto';

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
    private readonly claudeService: ClaudeService,
    private readonly unsplashService: UnsplashService,
  ) {}

  @Post('generate-cover')
  async generateCover(
    @Body() dto: GenerateCoverDto,
  ): Promise<{ imageUrl: string; source: string; query: string }> {
    const query = await this.claudeService.generateSearchQuery(
      dto.title,
      dto.eventType,
      dto.city,
    );
    const imageUrl = await this.unsplashService.searchPhoto(query);
    return { imageUrl, source: 'unsplash', query };
  }

  @Post()
  create(@Body() createEventDto: CreateEventDto) {
    return this.eventsService.send('createEvent', createEventDto);
  }

  @Get()
  findAll(@Query() filters: EventFilterDto) {
    return this.eventsService.send('findAllEvents', filters);
  }

  @Get('my')
  async findMyEvents(@Req() request: AuthenticatedRequest) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const user = await this.getAuthenticatedUser(request);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    return this.eventsService.send('findEventsByOwnerId', { ownerId: user.id });
  }

  @Get('upcoming')
  findUpcoming(@Query() filters: EventFilterDto) {
    return this.eventsService.send('findUpcomingEvents', {
      ...filters,
      limit: 5,
    });
  }

  @Patch(':id/publish')
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const user = await this.getAuthenticatedUser(request);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return this.eventsService.send('publishEvent', { id, ownerId: user.id });
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const user = await this.getAuthenticatedUser(request);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return this.eventsService.send('findOneEventForViewer', { id, authUserId: user.id });
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateEventDto: UpdateEventDto,
  ) {
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

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return firstValueFrom(this.usersService.send('findUserByEmail', { email }));
  }
}
