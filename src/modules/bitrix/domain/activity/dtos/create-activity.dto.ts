// domain/dtos/create-activity.dto.ts
import { IsString, IsDateString, IsNumber } from 'class-validator';

export class CreateBitrixActivityDto {
  @IsNumber()
  companyId: number;

  @IsString()
  title: string;

  @IsDateString()
  date: string;

  @IsString()
  responsible: string;
}
