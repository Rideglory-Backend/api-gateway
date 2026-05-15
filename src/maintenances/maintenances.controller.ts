import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { OmitType } from '@nestjs/mapped-types';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import {
  CreateMaintenanceDto,
  FindMaintenancesFilterDto,
  UpdateMaintenanceDto,
} from '@rideglory/contracts';
import { Request } from 'express';
import { catchError, firstValueFrom } from 'rxjs';
import {
  MAINTENANCES_SERVICE,
  USERS_SERVICE,
  VEHICLES_SERVICE,
} from '../config/services';

class CreateAuthenticatedMaintenanceDto extends OmitType(CreateMaintenanceDto, [
  'userId',
  'vehicleId',
] as const) {}

class UpdateAuthenticatedMaintenanceDto extends OmitType(UpdateMaintenanceDto, [
  'userId',
  'vehicleId',
] as const) {}

type AuthenticatedRequest = Request & {
  user?: {
    email?: string;
  };
};

@Controller('maintenances')
export class MaintenancesController {
  constructor(
    @Inject(MAINTENANCES_SERVICE)
    private readonly maintenancesService: ClientProxy,
    @Inject(USERS_SERVICE) private readonly usersService: ClientProxy,
    @Inject(VEHICLES_SERVICE) private readonly vehiclesService: ClientProxy,
  ) {}

  @Get('vehicle/:vehicleId')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async findByVehicleId(
    @Req() request: AuthenticatedRequest,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Query() filter: FindMaintenancesFilterDto,
  ) {
    const user = await this.getAuthenticatedUser(request);
    await this.validateVehicleOwner(vehicleId, user.id);

    return this.maintenancesService.send('findMaintenancesByVehicleId', {
      vehicleId,
      filter,
    });
  }

  @Post('vehicle/:vehicleId')
  async create(
    @Req() request: AuthenticatedRequest,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Body() createMaintenanceDto: CreateAuthenticatedMaintenanceDto,
  ) {
    const user = await this.getAuthenticatedUser(request);
    await this.validateVehicleOwner(vehicleId, user.id);

    return this.maintenancesService.send('createMaintenance', {
      ...createMaintenanceDto,
      vehicleId,
      userId: user.id,
    });
  }

  @Patch('vehicle/:vehicleId/:id')
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateMaintenanceDto: UpdateAuthenticatedMaintenanceDto,
  ) {
    const user = await this.getAuthenticatedUser(request);
    await this.validateVehicleOwner(vehicleId, user.id);

    return this.maintenancesService
      .send('updateMaintenance', {
        ...updateMaintenanceDto,
        id,
        vehicleId,
        userId: user.id,
      })
      .pipe(
        catchError((error) => {
          throw new RpcException({
            message: error.message,
            status: HttpStatus.NOT_FOUND,
          });
        }),
      );
  }

  @Delete('vehicle/:vehicleId/:id')
  async softDelete(
    @Req() request: AuthenticatedRequest,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const user = await this.getAuthenticatedUser(request);
    await this.validateVehicleOwner(vehicleId, user.id);

    return this.maintenancesService
      .send('softDeleteMaintenance', {
        id,
        vehicleId,
      })
      .pipe(
        catchError((error) => {
          throw new RpcException({
            message: error.message,
            status: HttpStatus.NOT_FOUND,
          });
        }),
      );
  }

  private async getAuthenticatedUser(request: AuthenticatedRequest) {
    const email = request.user?.email;
    if (!email) {
      throw new UnauthorizedException('Authenticated user email is required');
    }

    return firstValueFrom(this.usersService.send('findUserByEmail', { email }));
  }

  private async validateVehicleOwner(vehicleId: string, ownerId: string) {
    const vehicle = await firstValueFrom(
      this.vehiclesService.send('findOneVehicle', { id: vehicleId }),
    );

    if (vehicle.ownerId !== ownerId) {
      throw new UnauthorizedException(
        'You are not allowed to access maintenances for this vehicle',
      );
    }
  }
}
