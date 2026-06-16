import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  MAINTENANCES_SERVICE,
  USERS_SERVICE,
  VEHICLES_SERVICE,
} from '../config';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { catchError, map } from 'rxjs';
import { CreateVehicleDto, UpdateVehicleDto } from '@rideglory/contracts';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { Request } from 'express';
import { OmitType } from '@nestjs/mapped-types';
import { CreateSoatDto } from './dto/create-soat.dto';
import { CreateTecnomecanicaDto } from './dto/create-tecnomecanica.dto';

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
    return this.vehiclesService.send('findVehiclesByOwnerId', {
      ownerId: user.id,
    });
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
    return this.vehiclesService
      .send('setMainVehicleForOwner', {
        ownerId: user.id,
        vehicleId,
      })
      .pipe(
        catchError((error) => {
          throw new RpcException({
            message: error.message,
            status: error?.status ?? HttpStatus.BAD_REQUEST,
          });
        }),
      );
  }

  @Delete('my/:vehicleId')
  async softDeleteMyVehicle(
    @Req() request: AuthenticatedRequest,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
  ) {
    const user = await this.getAuthenticatedUser(request);

    await firstValueFrom(
      this.maintenancesService
        .send('softDeleteMaintenancesByVehicleId', { vehicleId })
        .pipe(
          timeout(15_000),
          catchError((error) => {
            throw new RpcException({
              message: error?.message ?? 'Failed to soft-delete vehicle maintenances',
              status: HttpStatus.BAD_GATEWAY,
            });
          }),
        ),
    );

    await firstValueFrom(
      this.vehiclesService
        .send('softDeleteVehicle', { vehicleId, ownerId: user.id })
        .pipe(
          catchError((error) => {
            throw new RpcException({
              message: error.message,
              status: error?.status ?? HttpStatus.NOT_FOUND,
            });
          }),
        ),
    );

    return { message: 'Vehicle deleted successfully', status: HttpStatus.OK };
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehiclesService.send('findOneVehicle', { id }).pipe(
      catchError((error) => {
        throw new RpcException({
          message: error.message,
          status: HttpStatus.NOT_FOUND,
        });
      }),
    );
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateVehicleDto: UpdateVehicleDto,
  ) {
    return this.vehiclesService
      .send('updateVehicle', { ...updateVehicleDto, id })
      .pipe(
        catchError((error) => {
          throw new RpcException({
            message: error.message,
            status: HttpStatus.NOT_FOUND,
          });
        }),
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

  // ── SOAT ──────────────────────────────────────────────────────────────────────

  /**
   * POST /api/vehicles/:vehicleId/soat
   * Creates or updates the SOAT record for a vehicle.
   */
  @Post(':vehicleId/soat')
  @HttpCode(HttpStatus.CREATED)
  async upsertSoat(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Body() dto: CreateSoatDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const user = await this.getAuthenticatedUser(request);
    return firstValueFrom(
      this.vehiclesService
        .send('upsertSoat', { vehicleId, ownerId: (user as { id: string }).id, dto })
        .pipe(timeout(10_000)),
    );
  }

  /**
   * GET /api/vehicles/:vehicleId/soat
   * Returns the SOAT record for a vehicle, or 204 if none.
   */
  @Get(':vehicleId/soat')
  async getSoat(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const user = await this.getAuthenticatedUser(request);
    const soat = await firstValueFrom(
      this.vehiclesService
        .send('findSoatByVehicle', { vehicleId, ownerId: (user as { id: string }).id })
        .pipe(timeout(10_000)),
    );
    return soat ?? null;
  }

  /**
   * DELETE /api/vehicles/:vehicleId/soat
   * Removes the SOAT record associated with a vehicle.
   */
  @Delete(':vehicleId/soat')
  async deleteSoat(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const user = await this.getAuthenticatedUser(request);
    return firstValueFrom(
      this.vehiclesService
        .send('deleteSoat', { vehicleId, ownerId: (user as { id: string }).id })
        .pipe(timeout(10_000)),
    );
  }

  // ── RTM (Tecnomecánica) ───────────────────────────────────────────────────

  /**
   * POST /api/vehicles/:vehicleId/tecnomecanica
   * Creates or updates the RTM record for a vehicle.
   */
  @Post(':vehicleId/tecnomecanica')
  @HttpCode(HttpStatus.CREATED)
  async upsertTecnomecanica(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Body() dto: CreateTecnomecanicaDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const user = await this.getAuthenticatedUser(request);
    return firstValueFrom(
      this.vehiclesService
        .send('upsertTecnomecanica', {
          vehicleId,
          ownerId: (user as { id: string }).id,
          dto,
        })
        .pipe(timeout(10_000)),
    );
  }

  /**
   * GET /api/vehicles/:vehicleId/tecnomecanica
   * Returns the RTM record for a vehicle, or throws 404 if none exists.
   */
  @Get(':vehicleId/tecnomecanica')
  async getTecnomecanica(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const user = await this.getAuthenticatedUser(request);
    const rtm = await firstValueFrom(
      this.vehiclesService
        .send('findTecnomecanicaByVehicle', {
          vehicleId,
          ownerId: (user as { id: string }).id,
        })
        .pipe(timeout(10_000)),
    );
    if (!rtm) {
      throw new NotFoundException(`No RTM found for vehicle ${vehicleId}`);
    }
    return rtm;
  }

  /**
   * DELETE /api/vehicles/:vehicleId/tecnomecanica
   * Removes the RTM record associated with a vehicle.
   */
  @Delete(':vehicleId/tecnomecanica')
  async deleteTecnomecanica(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const user = await this.getAuthenticatedUser(request);
    return firstValueFrom(
      this.vehiclesService
        .send('deleteTecnomecanica', {
          vehicleId,
          ownerId: (user as { id: string }).id,
        })
        .pipe(timeout(10_000)),
    );
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async getAuthenticatedUser(request: AuthenticatedRequest) {
    const email = request.user?.email;
    if (!email) {
      throw new UnauthorizedException('Authenticated user email is required');
    }

    return firstValueFrom(this.usersService.send('findUserByEmail', { email }));
  }
}
