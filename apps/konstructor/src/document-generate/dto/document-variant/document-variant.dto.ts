import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
import { OfferAlternativeSetComplectsDto } from '../complect/offer-alternative-set-complects.dto';
import { OfferComplectSectionDto } from '../complect/offer-complect-section.dto';
import { OfferComplectsModeEnum } from '../complect/offer-complects-mode.type';
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

    @ApiPropertyOptional({
        type: [OfferComplectSectionDto],
        description:
            'Комплекты варианта со своим наполнением: название, подпись поставки и группы инфоблоков каждого комплекта. По ним КП печатает наполнение по комплектам (complectsMode: separate); Word-шаблон получает их в данных ComplectSections. Без поля наполнение печатается одним объединённым списком из `complect`',
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => OfferComplectSectionDto)
    complects?: OfferComplectSectionDto[];

    @ApiPropertyOptional({
        enum: OfferComplectsModeEnum,
        enumName: 'OfferComplectsMode',
        default: OfferComplectsModeEnum.MERGED,
        description:
            'Как печатать наполнение варианта: merged — объединённое наполнение одним списком без повторов (поле `complect`); separate — по комплектам, у каждого свой раздел со своим заголовком (поле `complects`, нужно два комплекта и больше). Без поля действует merged',
    })
    @IsOptional()
    @IsEnum(OfferComplectsModeEnum)
    complectsMode?: OfferComplectsModeEnum;

    @ApiPropertyOptional({
        type: [OfferAlternativeSetComplectsDto],
        description:
            'Наполнение наборов для сравнения варианта: по разделу на набор — номер и заголовок набора из таблицы цен и наполнение его комплектов. Поле есть и не пусто — после наполнения общего набора КП печатает блок «Наполнение наборов для сравнения»; Word-шаблон получает его в данных AlternativeComplectSections. Без поля или с пустым списком КП печатается как раньше. Наборы для сравнения разных вариантов не объединяются',
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => OfferAlternativeSetComplectsDto)
    alternativeComplects?: OfferAlternativeSetComplectsDto[];

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
