import { IsArray, IsBoolean, IsNumber, ValidateNested } from "class-validator";

import { IsString } from "class-validator";
import { ProductTypeEnum } from "../product/product.dto";
import { ProductRowDto } from "../product-row/product-row.dto";
import { Type } from "class-transformer";


export type ProductRowSetItemType = {
    [key in ProductTypeEnum]: ProductRowDto[];
}

export class ProductRowSetItemDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowDto)
    garant: ProductRowDto[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowDto)
    lt: ProductRowDto[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowDto)
    consalting: ProductRowDto[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowDto)
    star: ProductRowDto[];
}

export class ProductRowSetDto {
    @IsNumber() id: number;
    @IsBoolean() show: boolean;
    @ValidateNested() @Type(() => ProductRowSetItemDto) rows: ProductRowSetItemDto;
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductRowDto) total: ProductRowDto[];
}