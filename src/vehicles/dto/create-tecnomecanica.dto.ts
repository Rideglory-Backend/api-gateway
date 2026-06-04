import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTecnomecanicaDto {
  @IsString()
  @IsOptional()
  certificateNumber?: string;

  @IsString()
  @IsNotEmpty()
  cdaName: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  expiryDate: string;

  @IsString()
  @IsOptional()
  documentUrl?: string;
}
