import { Body, Controller, Delete, Get, HttpStatus, Inject, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { VEHICLES_SERVICE } from '../config';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { catchError, map } from 'rxjs';
import { CreateVehicleDto, UpdateVehicleDto } from './dto';

@Controller('vehicles')
export class VehiclesController {
  constructor(@Inject(VEHICLES_SERVICE) private readonly vehiclesService: ClientProxy) { }

  @Get()
  findAll() {
    return this.vehiclesService.send('findAllVehicles', {});
  }

  @Post()
  create(@Body() createVehicleDto: CreateVehicleDto) {
    return this.vehiclesService.send('createVehicle', createVehicleDto);
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
    return this.vehiclesService.send('updateVehicle', { id, ...updateVehicleDto }).pipe(
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
}
