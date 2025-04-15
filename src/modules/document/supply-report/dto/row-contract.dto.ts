import { IsInt, IsString } from 'class-validator';

export class RowContractDto {
  @IsString()
  name: string;

  @IsInt()
  number: number;
}
