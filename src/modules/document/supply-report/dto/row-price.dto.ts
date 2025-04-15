import { Type } from 'class-transformer';
import { IsInt, IsNumber, ValidateNested } from 'class-validator';
import { RowMeasureDto } from './row-measure.dto';
import { RowDiscountDto } from './row-discount.dto';

export class RowPriceDto {
  @IsNumber()
  default: number;

  @IsNumber()
  current: number;

  @ValidateNested()
  @Type(() => RowMeasureDto)
  measure: RowMeasureDto;

  @IsNumber()
  month: number;

  @IsInt()
  quantity: number;

  @ValidateNested()
  @Type(() => RowDiscountDto)
  discount: RowDiscountDto;

  @IsNumber()
  sum: number;
}
