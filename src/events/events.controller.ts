import { Controller, Get, Post, Body, Patch, Param, Delete, Inject, ParseUUIDPipe } from '@nestjs/common';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { ClientProxy } from '@nestjs/microservices';
import { EVENTS_SERVICE } from '../config/services';

@Controller('events')
export class EventsController {
  constructor(@Inject(EVENTS_SERVICE) private readonly eventsService: ClientProxy) { }

  @Post()
  create(@Body() createEventDto: CreateEventDto) {
    return this.eventsService.send('createEvent', createEventDto);
  }

  @Get()
  findAll() {
    return this.eventsService.send('findAllEvents', {});
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.send('findOneEvent', id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() updateEventDto: UpdateEventDto) {
    return this.eventsService.send('updateEvent', { id: id, ...updateEventDto });
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.send('removeEvent', id);
  }
}
