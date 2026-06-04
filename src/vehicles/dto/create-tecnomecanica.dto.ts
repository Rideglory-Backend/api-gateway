import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTecnomecanicaDto {
  @IsString()
  @IsNotEmpty()
  certificateNumber: string;

  @IsString()
  @IsNotEmpty()
  cdaName: string;

  @IsString()
  @IsOptional()
  cdaCode?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  expiryDate: string;

  @IsString()
  @IsOptional()
  documentUrl?: string;
}
