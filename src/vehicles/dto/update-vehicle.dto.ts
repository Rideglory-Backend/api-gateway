import { IsNumber, IsPositive } from 'class-validator';
import { CreateVehicleDto } from './create-vehicle.dto';
import { PartialType } from '@nestjs/mapped-types';

export class UpdateVehicleDto extends PartialType(CreateVehicleDto) { }

