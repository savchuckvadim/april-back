import { IsInt, IsString } from 'class-validator';

export class RowMeasureDto {
  @IsInt()
  id: number;

  @IsInt()
  code: number;

  @IsInt()
  type: number;

  @IsString()
  name: string;

  @IsInt()
  contractNumber: number;
}
