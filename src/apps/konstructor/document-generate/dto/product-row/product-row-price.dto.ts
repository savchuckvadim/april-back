import { Type } from "class-transformer";
import { ValidateNested, IsString, IsNumber } from "class-validator";


export class RowDiscountDto {
    @IsNumber() precent: number;
    @IsNumber() amount: number;
    @IsString() current: string;
  }
  
  export class RowMeasureDto {
    @IsNumber() id: number;
    @IsNumber() code: number;
    @IsNumber() type: number;
    @IsString() name: string;
    @IsNumber() contractNumber: number;
  }
  
  export class RowPriceDto {
    @IsNumber() default: number;
    @IsNumber() current: number;
    @ValidateNested() @Type(() => RowMeasureDto) measure: RowMeasureDto;
    @IsNumber() month: number;
    @IsNumber() quantity: number;
    @ValidateNested() @Type(() => RowDiscountDto) discount: RowDiscountDto;
    @IsNumber() sum: number;
  }