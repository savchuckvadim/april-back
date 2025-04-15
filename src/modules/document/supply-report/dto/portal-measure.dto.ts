import { Type } from 'class-transformer';
import { IsInt, IsString, ValidateNested } from 'class-validator';
import { MeasureDto } from './measure.dto';

export class PortalMeasureDto {
  @IsInt()
  id: number;

  @IsInt()
  measure_id: number;

  @IsInt()
  portal_id: number;

  @IsString()
  bitrixId: string;

  @IsString()
  name: string;

  @IsString()
  shortName: string;

  @IsString()
  fullName: string;

  @IsString()
  created_at: string;

  @IsString()
  updated_at: string;

  @ValidateNested()
  @Type(() => MeasureDto)
  measure: MeasureDto;
}
