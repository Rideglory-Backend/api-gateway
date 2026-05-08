import { Body, Controller, Delete, Get, HttpStatus, Inject, Param, ParseUUIDPipe, Patch, Post, Req, UnauthorizedException } from '@nestjs/common';
import { USERS_SERVICE, VEHICLES_SERVICE } from '../config';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { catchError, map } from 'rxjs';
import { CreateVehicleDto, UpdateVehicleDto } from '@rideglory/contracts';
import { firstValueFrom } from 'rxjs';
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
  ) { }

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
  hardDelete(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.send('hardDeleteVehicle', { id }).pipe(
      catchError((error) => {
        throw new RpcException({
          message: error.message,
          status: HttpStatus.NOT_FOUND,
        });
      }),
      map((__) => {
        return {
          message: 'Vehicle deleted successfully',
          status: HttpStatus.OK,
        };
      })
    );
  }

  private async getAuthenticatedUser(request: AuthenticatedRequest) {
    const email = request.user?.email;
    if (!email) {
      throw new UnauthorizedException('Authenticated user email is required');
    }

    return firstValueFrom(this.usersService.send('findUserByEmail', { email }));
  }
}
