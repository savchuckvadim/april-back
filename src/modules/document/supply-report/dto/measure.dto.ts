import { IsInt, IsString } from 'class-validator';

export class MeasureDto {
  @IsInt()
  id: number;

  @IsString()
  created_at: string;

  @IsString()
  updated_at: string;

  @IsString()
  name: string;

  @IsString()
  shortName: string;

  @IsString()
  fullName: string;

  @IsString()
  code: string;

  @IsString()
  type: string;
}
