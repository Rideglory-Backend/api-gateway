import { Controller, Get, Inject, Req, UnauthorizedException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { EVENTS_SERVICE, USERS_SERVICE, VEHICLES_SERVICE } from 'config';
import { Request } from 'express';
import { firstValueFrom } from 'rxjs';

type AuthenticatedRequest = Request & {
  user?: {
    email?: string;
  };
};

@Controller('home')
export class HomeController {
  constructor(
    @Inject(USERS_SERVICE) private readonly usersService: ClientProxy,
    @Inject(VEHICLES_SERVICE) private readonly vehiclesService: ClientProxy,
    @Inject(EVENTS_SERVICE) private readonly eventsService: ClientProxy,
  ) {}

  @Get()
  async getHomeData(@Req() request: AuthenticatedRequest) {
    const user = await this.getAuthenticatedUser(request);

    const [vehicles, upcomingEvents] = await Promise.all([
      firstValueFrom(
        this.vehiclesService.send('findVehiclesByOwnerId', {
          ownerId: user.id,
        }),
      ),
      firstValueFrom(this.eventsService.send('findUpcomingEvents', { limit: 5 })),
    ]);

    return {
      user,
      vehicles,
      upcomingEvents,
    };
  }

  private async getAuthenticatedUser(request: AuthenticatedRequest) {
    const email = request.user?.email;
    if (!email) {
      throw new UnauthorizedException('Authenticated user email is required');
    }

    return firstValueFrom(this.usersService.send('findUserByEmail', { email }));
  }
}
