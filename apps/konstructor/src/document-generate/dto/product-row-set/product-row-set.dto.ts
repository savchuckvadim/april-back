import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
    IsArray,
    IsBoolean,
    IsNumber,
    IsOptional,
    ValidateNested,
} from 'class-validator';
import { ProductTypeEnum } from '../product/product.dto';
import { ProductRowDto } from '../product-row/product-row.dto';
import { Type } from 'class-transformer';

export type ProductRowSetItemType = {
    [key in ProductTypeEnum]: ProductRowDto[];
};

/**
 * Строки сета по типам продукта (легаси RowSetType.rows).
 *
 * Все ключи необязательны: в сете может не быть консалтинга, LT, Академии
 * или даже Гаранта, а разные фронты и старые слепки присылают отсутствующий
 * тип то пустым массивом, то не присылают вовсе. Обязательный ключ ронял бы
 * всю генерацию КП/счёта ответом 400 из-за одного пустого типа. Читать ключи
 * — только через collectSetRows / `rows?.garant?.[0]`.
 *
 * Объявлять нужно ВСЕ типы, которые шлёт фронт: глобальный ValidationPipe
 * (whitelist: true) молча срезает необъявленные ключи. Так из счёта пропадала
 * строка Академии, а «Итого» (sets[].total) её сумму включало (11.11.2026).
 */
export class ProductRowSetItemDto {
    @ApiPropertyOptional({ type: [ProductRowDto] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowDto)
    garant?: ProductRowDto[];

    @ApiPropertyOptional({ type: [ProductRowDto] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowDto)
    lt?: ProductRowDto[];

    @ApiPropertyOptional({ type: [ProductRowDto] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowDto)
    consalting?: ProductRowDto[];

    @ApiPropertyOptional({ type: [ProductRowDto] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowDto)
    star?: ProductRowDto[];

    @ApiPropertyOptional({ type: [ProductRowDto] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowDto)
    lt_other?: ProductRowDto[];

    @ApiPropertyOptional({ type: [ProductRowDto] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowDto)
    academy?: ProductRowDto[];
}

/** Сет строк (основной или «для сравнения») с total-строкой */
export class ProductRowSetDto {
    @ApiProperty({ type: Number })
    @IsNumber()
    id: number;
    @ApiProperty({
        description: 'Сет показан свёрнуто (одной строкой)',
        type: Boolean,
    })
    @IsBoolean()
    show: boolean;
    @ApiProperty({ type: ProductRowSetItemDto })
    @ValidateNested()
    @Type(() => ProductRowSetItemDto)
    rows: ProductRowSetItemDto;
    @ApiProperty({ type: [ProductRowDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowDto)
    total: ProductRowDto[];
}
