import { IsNumber, IsString } from 'class-validator';

export class RowDiscountDto {
  @IsNumber()
  precent: number;

  @IsNumber()
  amount: number;

  @IsString()
  current: string;
}
