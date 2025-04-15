import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { RowComplectDto } from './row-complect.dto';
import { RowContractDto } from './row-contract.dto';
import { RowSupplyDto } from './row-supply.dto';
import { RowPriceDto } from './row-price.dto';
import { ProductDto } from './product.dto';
import { SupplyDto } from './supply.dto';

export class RowDto {
  @IsInt()
  number: number;

  @IsString()
  name: string;

  @IsString()
  shortName: string;

  @IsString()
  type: string;

  @IsString()
  productType: string;

  @IsInt()
  id: number;

  @IsInt()
  setId: number;

  @IsBoolean()
  isUpdating: boolean;

  @ValidateNested()
  @Type(() => RowComplectDto)
  complect: RowComplectDto;

  @ValidateNested()
  @Type(() => RowContractDto)
  contract: RowContractDto;

  @ValidateNested()
  @Type(() => RowSupplyDto)
  supply: RowSupplyDto;

  @ValidateNested()
  @Type(() => RowPriceDto)
  price: RowPriceDto;

  @ValidateNested()
  @Type(() => ProductDto)
  product: ProductDto;

  @ValidateNested()
  @Type(() => SupplyDto)
  currentSupply: SupplyDto;
}
