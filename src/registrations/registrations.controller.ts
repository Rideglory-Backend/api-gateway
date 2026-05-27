import {
  Body,
  Controller,
  Get,
  Inject,
  Logger,
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
import { NotificationsService } from '../notifications/notifications.service';

type AuthenticatedRequest = Request & {
  user?: {
    uid: string;
    email?: string;
    token: unknown;
  };
};

type RegistrationResult = {
  id: string;
  eventId: string;
  userId: string;
};

type EventResult = {
  id: string;
  name: string;
  ownerId: string;
};

type UserResult = {
  id: string;
  email: string;
  fcmToken?: string | null;
};

const RPC_TIMEOUT_MS = 5_000;

@Controller()
export class RegistrationsController {
  private readonly logger = new Logger('RegistrationsController');

  constructor(
    @Inject(EVENTS_SERVICE) private readonly eventsService: ClientProxy,
    @Inject(USERS_SERVICE) private readonly usersService: ClientProxy,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Post('events/:eventId/registrations')
  async create(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() body: CreateRegistrationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const user = await this.getAuthenticatedUser(request);
    const registration = await firstValueFrom<RegistrationResult>(
      this.eventsService
        .send('createRegistration', { ...body, eventId, userId: user.id })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );

    // Notify event organizer of new registration
    this.sendRegistrationNotification(
      eventId,
      registration.id,
      'NEW_REGISTRATION',
    ).catch((err: unknown) =>
      this.logger.warn(`NEW_REGISTRATION FCM failed: ${String(err)}`),
    );

    return registration;
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
    const registration = await firstValueFrom<RegistrationResult>(
      this.eventsService
        .send('approveRegistration', { registrationId })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );

    // Notify the registrant
    this.sendStatusNotification(
      registration.userId,
      registration.eventId,
      registration.id,
      'REGISTRATION_APPROVED',
    ).catch((err: unknown) =>
      this.logger.warn(`REGISTRATION_APPROVED FCM failed: ${String(err)}`),
    );

    return registration;
  }

  @Post('registrations/:registrationId/reject')
  async reject(@Param('registrationId', ParseUUIDPipe) registrationId: string) {
    const registration = await firstValueFrom<RegistrationResult>(
      this.eventsService
        .send('rejectRegistration', { registrationId })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );

    // Notify the registrant
    this.sendStatusNotification(
      registration.userId,
      registration.eventId,
      registration.id,
      'REGISTRATION_REJECTED',
    ).catch((err: unknown) =>
      this.logger.warn(`REGISTRATION_REJECTED FCM failed: ${String(err)}`),
    );

    return registration;
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

  // ── FCM helpers ──────────────────────────────────────────────────────────────

  /**
   * Sends FCM notification to the event organizer on new registration.
   */
  private async sendRegistrationNotification(
    eventId: string,
    registrationId: string,
    type: 'NEW_REGISTRATION',
  ): Promise<void> {
    const event = await firstValueFrom<EventResult>(
      this.eventsService
        .send('findOneEvent', eventId)
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );

    const organizer = await firstValueFrom<UserResult>(
      this.usersService
        .send('findOneUser', { id: event.ownerId })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );

    await this.notificationsService.createNotification(organizer.id, type, {
      eventId,
      registrationId,
      route: `rideglory://events/detail-by-id?id=${eventId}`,
    });

    if (organizer.fcmToken) {
      await this.notificationsService.sendFcm(
        organizer.fcmToken,
        'Nueva inscripción',
        `Un rider se inscribió a tu evento "${event.name}"`,
        { type, eventId, registrationId, route: `rideglory://events/detail-by-id?id=${eventId}` },
      );
    }
  }

  /**
   * Sends FCM notification to the registrant on approval/rejection.
   */
  private async sendStatusNotification(
    userId: string,
    eventId: string,
    registrationId: string,
    type: 'REGISTRATION_APPROVED' | 'REGISTRATION_REJECTED',
  ): Promise<void> {
    const [user, event] = await Promise.all([
      firstValueFrom<UserResult>(
        this.usersService
          .send('findOneUser', { id: userId })
          .pipe(timeout(RPC_TIMEOUT_MS)),
      ),
      firstValueFrom<EventResult>(
        this.eventsService
          .send('findOneEvent', eventId)
          .pipe(timeout(RPC_TIMEOUT_MS)),
      ),
    ]);

    const title =
      type === 'REGISTRATION_APPROVED'
        ? 'Inscripción aprobada'
        : 'Inscripción rechazada';
    const body =
      type === 'REGISTRATION_APPROVED'
        ? `Tu inscripción al evento "${event.name}" fue aprobada`
        : `Tu inscripción al evento "${event.name}" fue rechazada`;

    await this.notificationsService.createNotification(userId, type, {
      eventId,
      registrationId,
      route: `rideglory://events/detail-by-id?id=${eventId}`,
    });

    if (user.fcmToken) {
      await this.notificationsService.sendFcm(user.fcmToken, title, body, {
        type,
        eventId,
        registrationId,
        route: `rideglory://events/detail-by-id?id=${eventId}`,
      });
    }
  }

  // ── Auth helper ───────────────────────────────────────────────────────────────

  private async getAuthenticatedUser(request: AuthenticatedRequest) {
    const email = request.user?.email;
    if (!email) {
      throw new UnauthorizedException('Authenticated user email is required');
    }

    const user = await firstValueFrom(
      this.usersService
        .send('findUserByEmail', { email })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
    return user as { id: string };
  }
}
