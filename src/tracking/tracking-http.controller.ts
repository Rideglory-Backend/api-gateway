import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { Request } from 'express';
import {
  StartTrackingSessionBodyDto,
  StopTrackingSessionBodyDto,
} from '@rideglory/contracts';
import { EVENTS_SERVICE } from '../config/services';
import { TrackingBroadcaster } from './tracking-broadcaster.service';

type AuthenticatedRequest = Request & {
  user?: {
    uid: string;
    email?: string;
    token: unknown;
  };
};

@Controller('events')
export class TrackingHttpController {
  constructor(
    @Inject(EVENTS_SERVICE) private readonly eventsService: ClientProxy,
    private readonly trackingBroadcaster: TrackingBroadcaster,
  ) {}

  @Post(':eventId/tracking/session/start')
  async startSession(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() body: StartTrackingSessionBodyDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const authUserId = request.user?.uid;
    if (!authUserId) {
      throw new UnauthorizedException();
    }
    const result = await firstValueFrom(
      this.eventsService
        .send('trackingStartSession', {
          eventId,
          rider: body.rider,
          authUserId,
        })
        .pipe(timeout(10_000)),
    );
    void this.trackingBroadcaster.broadcastSnapshot(eventId).catch(() => undefined);
    return result;
  }

  @Post(':eventId/tracking/session/stop')
  async stopSession(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() body: StopTrackingSessionBodyDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const authUserId = request.user?.uid;
    if (!authUserId) {
      throw new UnauthorizedException();
    }
    const result = await firstValueFrom(
      this.eventsService
        .send('trackingStopSession', {
          eventId,
          userId: body.userId,
          authUserId,
        })
        .pipe(timeout(10_000)),
    );
    this.trackingBroadcaster.broadcastRiderLeft(eventId, body.userId);
    return result;
  }

  @Get(':eventId/tracking/snapshot')
  async snapshot(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!request.user?.uid) {
      throw new UnauthorizedException();
    }
    return firstValueFrom(
      this.eventsService
        .send('trackingSnapshot', { eventId })
        .pipe(timeout(10_000)),
    );
  }
}
