import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { ComplectDto } from '../complect/complect.dto';
import { ProductRowDto } from '../product-row/product-row.dto';
import { ProductRowSetDto } from '../product-row-set/product-row-set.dto';
import { ContractSpecificationDto } from '../specification/specification.dto';
import { ContractDto } from '../../../dto/contract.dto';
import { SupplyDto } from '../../../dto/supply.dto';
import { CONTRACT_LTYPE } from '../../type/contract.type';

/** Наборы строк варианта: основной и «для сравнения» — как у сделки. */
export class DocumentVariantSetsDto {
    @ApiProperty({ type: [ProductRowSetDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowSetDto)
    general: ProductRowSetDto[];

    @ApiProperty({ type: [ProductRowSetDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowSetDto)
    alternative: ProductRowSetDto[];
}

/**
 * Один участник документа — вариант комплекта в том же виде, в каком фронт
 * шлёт одиночный документ: наполнение, договор, ОД, строки, итог.
 *
 * Единица документа — комплект (гарант-строка с наполнением): в `complect`
 * может быть несколько наполнений, если в наборе несколько комплектов.
 * Легаси-фронт шлёт одно, новый — сколько есть; бэк обрабатывает одинаково.
 */
export class DocumentVariantDto {
    @ApiProperty({
        description: 'Элемент смарта «Варианты комплекта»',
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    variantSmartId: number | null;

    @ApiProperty({ description: 'Название варианта — заголовок страницы' })
    @IsString()
    title: string;

    @ApiProperty({ enum: CONTRACT_LTYPE, enumName: 'CONTRACT_LTYPE' })
    @IsEnum(CONTRACT_LTYPE)
    contractType: CONTRACT_LTYPE;

    @ApiProperty({
        description: 'Наполнение: инфоблоки по группам',
        type: [ComplectDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ComplectDto)
    complect: ComplectDto[];

    @ApiProperty({ type: ContractDto })
    @ValidateNested()
    @Type(() => ContractDto)
    contract: ContractDto;

    @ApiProperty({ type: SupplyDto })
    @ValidateNested()
    @Type(() => SupplyDto)
    supply: SupplyDto;

    @ApiProperty({ description: 'Все строки варианта', type: [ProductRowDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowDto)
    rows: ProductRowDto[];

    @ApiProperty({ type: DocumentVariantSetsDto })
    @ValidateNested()
    @Type(() => DocumentVariantSetsDto)
    sets: DocumentVariantSetsDto;

    @ApiProperty({
        description: 'Итоговая строка варианта',
        type: ProductRowDto,
    })
    @ValidateNested()
    @Type(() => ProductRowDto)
    total: ProductRowDto;

    @ApiProperty({
        description:
            'Спецификация договора варианта — для заявки RPA и договора',
        type: ContractSpecificationDto,
        required: false,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ContractSpecificationDto)
    contractSpecificationState?: ContractSpecificationDto;
}
