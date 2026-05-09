import { Body, Controller, Delete, Get, HttpStatus, Inject, Param, ParseUUIDPipe, Patch, Post, Put, Req, UnauthorizedException } from '@nestjs/common';
import { MAINTENANCES_SERVICE, USERS_SERVICE, VEHICLES_SERVICE } from '../config';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { catchError, map } from 'rxjs';
import { CreateVehicleDto, UpdateVehicleDto } from '@rideglory/contracts';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { Request } from 'express';
import { OmitType } from '@nestjs/mapped-types';

class CreateAuthenticatedVehicleDto extends OmitType(CreateVehicleDto, [
  'ownerId',
] as const) {}

type AuthenticatedRequest = Request & {
  user?: {
    email?: string;
  };
};

@Controller('vehicles')
export class VehiclesController {
  constructor(
    @Inject(VEHICLES_SERVICE) private readonly vehiclesService: ClientProxy,
    @Inject(USERS_SERVICE) private readonly usersService: ClientProxy,
    @Inject(MAINTENANCES_SERVICE)
    private readonly maintenancesService: ClientProxy,
  ) {}

  @Get()
  findAll() {
    return this.vehiclesService.send('findAllVehicles', {});
  }

  @Post()
  create(@Body() createVehicleDto: CreateVehicleDto) {
    return this.vehiclesService.send('createVehicle', createVehicleDto);
  }

  @Get('my')
  async findMyVehicles(@Req() request: AuthenticatedRequest) {
    const user = await this.getAuthenticatedUser(request);
    return this.vehiclesService.send('findVehiclesByOwnerId', { ownerId: user.id });
  }

  @Post('my')
  async createMyVehicle(
    @Req() request: AuthenticatedRequest,
    @Body() createVehicleDto: CreateAuthenticatedVehicleDto,
  ) {
    const user = await this.getAuthenticatedUser(request);
    return this.vehiclesService.send('createVehicle', {
      ...createVehicleDto,
      ownerId: user.id,
    });
  }

  @Put('my/:vehicleId/main')
  async setMyMainVehicle(
    @Req() request: AuthenticatedRequest,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
  ) {
    const user = await this.getAuthenticatedUser(request);
    return this.vehiclesService.send('setMainVehicleForOwner', {
      ownerId: user.id,
      vehicleId,
    }).pipe(
      catchError((error) => {
        throw new RpcException({
          message: error.message,
          status: error?.status ?? HttpStatus.BAD_REQUEST,
        });
      }),
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.send('findOneVehicle', { id }).pipe(
      catchError((error) => { 
        throw new RpcException({
          message: error.message,
          status: HttpStatus.NOT_FOUND,
        });
      })
    );
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() updateVehicleDto: UpdateVehicleDto) {
    return this.vehiclesService.send('updateVehicle', { ...updateVehicleDto, id }).pipe(
      catchError((error) => {
        throw new RpcException({
          message: error.message,
          status: HttpStatus.NOT_FOUND,
        });
      })
    );
  }

  @Delete('hard-delete/:id')
  async hardDelete(@Param('id', ParseUUIDPipe) id: string) {
    await firstValueFrom(
      this.maintenancesService
        .send('softDeleteMaintenancesByVehicleId', { vehicleId: id })
        .pipe(
          timeout(15_000),
          catchError((error) => {
            throw new RpcException({
              message:
                error?.message ??
                'Failed to remove vehicle maintenances before deletion',
              status: HttpStatus.BAD_GATEWAY,
            });
          }),
        ),
    );

    await firstValueFrom(
      this.vehiclesService.send('hardDeleteVehicle', { id }).pipe(
        catchError((error) => {
          throw new RpcException({
            message: error.message,
            status: HttpStatus.NOT_FOUND,
          });
        }),
      ),
    );

    return {
      message: 'Vehicle deleted successfully',
      status: HttpStatus.OK,
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
