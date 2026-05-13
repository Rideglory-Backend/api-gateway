import { IsNotEmpty, IsString } from 'class-validator';

export class GenerateCoverDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  eventType: string;

  @IsString()
  @IsNotEmpty()
  city: string;
}
