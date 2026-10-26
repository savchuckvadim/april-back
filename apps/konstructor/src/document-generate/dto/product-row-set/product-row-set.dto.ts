import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNumber, ValidateNested } from 'class-validator';
import { ProductTypeEnum } from '../product/product.dto';
import { ProductRowDto } from '../product-row/product-row.dto';
import { Type } from 'class-transformer';

export type ProductRowSetItemType = {
    [key in ProductTypeEnum]: ProductRowDto[];
};

/** Строки сета по типам продукта (легаси RowSetType.rows) */
export class ProductRowSetItemDto {
    @ApiProperty({ type: [ProductRowDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowDto)
    garant: ProductRowDto[];

    @ApiProperty({ type: [ProductRowDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowDto)
    lt: ProductRowDto[];

    @ApiProperty({ type: [ProductRowDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowDto)
    consalting: ProductRowDto[];

    @ApiProperty({ type: [ProductRowDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowDto)
    star: ProductRowDto[];
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
