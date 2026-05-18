import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSoatDto {
  @IsString()
  @IsOptional()
  policyNumber?: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  expiryDate: string;

  @IsString()
  @IsNotEmpty()
  insurer: string;

  @IsString()
  @IsOptional()
  documentUrl?: string;
}
