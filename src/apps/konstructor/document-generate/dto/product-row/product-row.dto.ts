// product.dto.ts (TypeScript, адаптация на основе Python-примера)
import {
    IsBoolean,
    IsEnum,
    IsNumber,
    IsString,
    ValidateNested,
    IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SupplyDto } from '../../../dto/supply.dto';
import { ProductDto, ProductTypeEnum } from '../product/product.dto';
import { RowPriceDto } from './product-row-price.dto';

export class RowComplectDto {
    @IsString() type: string;
    @IsNumber() number: number;
}

export class ProductRowContractDto {
    @IsString() name: string;
    @IsNumber() number: number;
}

export class ProductRowSupplyDto {
    @IsString() name: string;
    @IsString() forkp: string;
    @IsNumber() number: number;
    @IsString() type: 'internet' | 'proxima';
    @IsString() defaultName: string;
    @IsString() alternativeName: string;
}

export class ProductRowDto {
    @IsNumber() number: number;
    @IsString() name: string;
    @IsString() shortName: string;
    @IsString() defaultName: string;
    @IsString() defaultShortName: string;
    @IsString() alternativeName: string;
    @IsString() alternativeShortName: string;
    @IsString() type: string;

    @IsNumber() id: number;
    @IsNumber() setId: number;
    @IsBoolean() isUpdating: boolean;
    @IsOptional() @IsEnum(ProductTypeEnum) productType?: ProductTypeEnum;
    @ValidateNested() @Type(() => RowComplectDto) complect: RowComplectDto;
    @ValidateNested() @Type(() => ProductRowContractDto) contract: ProductRowContractDto;
    @ValidateNested() @Type(() => ProductRowSupplyDto) supply: ProductRowSupplyDto;
    @ValidateNested() @Type(() => RowPriceDto) price: RowPriceDto;
    @ValidateNested() @Type(() => ProductDto) product: ProductDto;
    @ValidateNested() @Type(() => SupplyDto) currentSupply: SupplyDto;
}

export class ProductRowsItemsDto {
    @ValidateNested({ each: true })
    @Type(() => ProductRowDto)
    items: ProductRowDto[];
}
