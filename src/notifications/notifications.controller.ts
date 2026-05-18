import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Request } from 'express';
import { firstValueFrom, timeout } from 'rxjs';
import { USERS_SERVICE } from '../config/services';
import { NotificationsService } from './notifications.service';
import { RegisterFcmTokenDto } from './dto/register-fcm-token.dto';

type AuthenticatedRequest = Request & {
  user?: { uid: string; email?: string };
};

const RPC_TIMEOUT_MS = 5_000;

@Controller()
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    @Inject(USERS_SERVICE) private readonly usersService: ClientProxy,
  ) {}

  /**
   * POST /api/notifications/fcm-token
   * Registers (or updates) the FCM token for the authenticated user.
   */
  @Post('notifications/fcm-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  async registerFcmToken(
    @Body() dto: RegisterFcmTokenDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    const user = await this.getAuthenticatedUser(request);
    await firstValueFrom(
      this.usersService
        .send('updateFcmToken', { id: user.id, fcmToken: dto.fcmToken })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  /**
   * GET /api/notifications?cursor=<lastId>&limit=20
   * Returns paginated notifications for the authenticated user (cursor-based, newest first).
   */
  @Get('notifications')
  async listNotifications(
    @Req() request: AuthenticatedRequest,
    @Query('cursor') cursor?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    const user = await this.getAuthenticatedUser(request);
    return this.notificationsService.listNotifications(
      user.id,
      cursor,
      limit ?? 20,
    );
  }

  /**
   * PATCH /api/notifications/:id/read
   * Marks a specific notification as read. Returns 403 if not owned by user.
   */
  @Patch('notifications/:id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    const user = await this.getAuthenticatedUser(request);
    await this.notificationsService.markRead(id, user.id);
  }

  /**
   * PATCH /api/notifications/read-all
   * Marks all unread notifications for the authenticated user as read.
   */
  @Patch('notifications/read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAllRead(@Req() request: AuthenticatedRequest): Promise<void> {
    const user = await this.getAuthenticatedUser(request);
    await this.notificationsService.markAllRead(user.id);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async getAuthenticatedUser(
    request: AuthenticatedRequest,
  ): Promise<{ id: string }> {
    const email = request.user?.email;
    if (!email) {
      throw new UnauthorizedException('Authenticated user email is required');
    }
    return firstValueFrom(
      this.usersService
        .send('findUserByEmail', { email })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }
}
