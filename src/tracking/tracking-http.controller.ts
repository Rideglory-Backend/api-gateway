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
import { EVENTS_SERVICE, USERS_SERVICE } from '../config/services';
import { TrackingBroadcaster } from './tracking-broadcaster.service';
import { NotificationsService } from '../notifications/notifications.service';

type AuthenticatedRequest = Request & {
  user?: {
    uid: string;
    email?: string;
    token: unknown;
  };
};

type UserResult = {
  id: string;
  fcmToken?: string | null;
};

const RPC_TIMEOUT_MS = 10_000;

@Controller('events')
export class TrackingHttpController {
  constructor(
    @Inject(EVENTS_SERVICE) private readonly eventsService: ClientProxy,
    @Inject(USERS_SERVICE) private readonly usersService: ClientProxy,
    private readonly trackingBroadcaster: TrackingBroadcaster,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** POST /api/events/:eventId/tracking/start — organizer only */
  @Post(':eventId/tracking/start')
  async startTracking(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const authUserId = request.user?.uid;
    if (!authUserId) {
      throw new UnauthorizedException();
    }

    const result = await firstValueFrom<{ id: string; state: string }>(
      this.eventsService
        .send('trackingStart', { eventId, authUserId })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );

    this.trackingBroadcaster.broadcastEventStarted(eventId);

    return result;
  }

  /** POST /api/events/:eventId/tracking/end — organizer only */
  @Post(':eventId/tracking/end')
  async endTracking(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const authUserId = request.user?.uid;
    if (!authUserId) {
      throw new UnauthorizedException();
    }

    const result = await firstValueFrom<{ id: string; state: string }>(
      this.eventsService
        .send('trackingEnd', { eventId, authUserId })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );

    this.trackingBroadcaster.broadcastEventEnded(eventId);

    // FCM multicast to approved registrants
    void this.sendEventEndedNotifications(eventId).catch(() => undefined);

    return result;
  }

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
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
    void this.trackingBroadcaster
      .broadcastSnapshot(eventId)
      .catch(() => undefined);
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
        .pipe(timeout(RPC_TIMEOUT_MS)),
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
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  /** GET /api/events/:eventId/route */
  @Get(':eventId/route')
  async getRoute(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!request.user?.uid) {
      throw new UnauthorizedException();
    }
    const geoJson = await firstValueFrom<object | null>(
      this.eventsService
        .send('getRouteGeoJson', { eventId })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
    if (!geoJson) {
      return {};
    }
    return geoJson;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async sendEventEndedNotifications(eventId: string): Promise<void> {
    const userIds = await firstValueFrom<string[]>(
      this.eventsService
        .send('getApprovedRegistrantUserIds', { eventId })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );

    for (const userId of userIds) {
      try {
        const user = await firstValueFrom<UserResult>(
          this.usersService
            .send('findOneUser', { id: userId })
            .pipe(timeout(5_000)),
        );

        if (user.fcmToken) {
          await this.notificationsService.sendFcm(
            user.fcmToken,
            'La rodada ha terminado',
            'El organizador ha finalizado la rodada',
            { type: 'TRACKING_ENDED', eventId },
          );
        }
      } catch {
        // Non-fatal — continue with other users
      }
    }
  }
}
