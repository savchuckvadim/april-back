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
import { ApiProperty } from '@nestjs/swagger';
import { SupplyDto } from '../../../dto/supply.dto';
import { ProductDto, ProductTypeEnum } from '../product/product.dto';
import { RowPriceDto } from './product-row-price.dto';

export class RowComplectDto {
    @ApiProperty({ description: 'prof | universal', type: String })
    @IsString()
    type: string;
    @ApiProperty({ description: 'Легаси-номер комплекта', type: Number })
    @IsNumber()
    number: number;
}

export class ProductRowContractDto {
    @ApiProperty({ type: String })
    @IsString()
    name: string;
    @ApiProperty({ description: 'Легаси-номер договора', type: Number })
    @IsNumber()
    number: number;
}

export class ProductRowSupplyDto {
    @ApiProperty({ type: String })
    @IsString()
    name: string;
    @ApiProperty({ description: 'Подпись поставки для КП (quantityForKp)', type: String })
    @IsString()
    forkp: string;
    @ApiProperty({ description: 'Легаси-номер поставки', type: Number })
    @IsNumber()
    number: number;
    @ApiProperty({ description: 'internet | proxima', type: String })
    @IsString()
    type: 'internet' | 'proxima';

    @ApiProperty({ type: String, required: false })
    @IsOptional()
    @IsString()
    defaultName?: string;

    @ApiProperty({ type: String, required: false })
    @IsOptional()
    @IsString()
    alternativeName?: string;
}

/** Строка таблицы конструктора (легаси ProductRowType) — единица документов */
export class ProductRowDto {
    @ApiProperty({ description: 'Легаси-номер строки', type: Number })
    @IsNumber()
    number: number;
    @ApiProperty({ type: String })
    @IsString()
    name: string;
    @ApiProperty({ type: String })
    @IsString()
    shortName: string;
    @ApiProperty({ type: String, required: false })
    @IsOptional()
    @IsString()
    defaultName?: string;
    @ApiProperty({ type: String, required: false })
    @IsOptional()
    @IsString()
    defaultShortName?: string;
    @ApiProperty({ type: String, required: false })
    @IsOptional()
    @IsString()
    alternativeName?: string;
    @ApiProperty({ type: String, required: false })
    @IsOptional()
    @IsString()
    alternativeShortName?: string;

    @ApiProperty({ description: 'general | alternative', type: String })
    @IsString()
    type: string;

    @ApiProperty({ description: 'id строки в сете (0 — главный товар)', type: Number })
    @IsNumber()
    id: number;
    @ApiProperty({ type: Number })
    @IsNumber()
    setId: number;
    @ApiProperty({ type: Boolean })
    @IsBoolean()
    isUpdating: boolean;
    @ApiProperty({ enum: ProductTypeEnum, enumName: 'ProductType', required: false })
    @IsOptional()
    @IsEnum(ProductTypeEnum)
    productType?: ProductTypeEnum;
    @ApiProperty({ type: RowComplectDto })
    @ValidateNested()
    @Type(() => RowComplectDto)
    complect: RowComplectDto;
    @ApiProperty({ type: ProductRowContractDto })
    @ValidateNested()
    @Type(() => ProductRowContractDto)
    contract: ProductRowContractDto;
    @ApiProperty({ type: ProductRowSupplyDto, required: false })
    @ValidateNested()
    @IsOptional()
    @Type(() => ProductRowSupplyDto)
    supply?: ProductRowSupplyDto;
    @ApiProperty({ type: RowPriceDto })
    @ValidateNested()
    @Type(() => RowPriceDto)
    price: RowPriceDto;
    @ApiProperty({ type: ProductDto })
    @ValidateNested()
    @Type(() => ProductDto)
    product: ProductDto;
    @ApiProperty({ type: SupplyDto })
    @ValidateNested()
    @Type(() => SupplyDto)
    currentSupply: SupplyDto;
}

export class ProductRowsItemsDto {
    @ApiProperty({ type: [ProductRowDto] })
    @ValidateNested({ each: true })
    @Type(() => ProductRowDto)
    items: ProductRowDto[];
}
