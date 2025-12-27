import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdateBtxCategoryDto {
    @ApiPropertyOptional({
        description: 'Parent type for grouping categories',
        example: 'cold',
    })
    @IsString()
    @IsOptional()
    parent_type?: string;

    @ApiPropertyOptional({
        description: 'Category type',
        example: 'deal',
    })
    @IsString()
    @IsOptional()
    type?: string;

    @ApiPropertyOptional({
        description: 'Category group',
        example: 'sales',
    })
    @IsString()
    @IsOptional()
    group?: string;

    @ApiPropertyOptional({
        description: 'Category title',
        example: 'Category Title',
    })
    @IsString()
    @IsOptional()
    title?: string;

    @ApiPropertyOptional({
        description: 'Category name',
        example: 'category_name',
    })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional({
        description: 'Bitrix ID',
        example: '23',
    })
    @IsString()
    @IsOptional()
    bitrixId?: string;

    @ApiPropertyOptional({
        description: 'Bitrix Camel ID',
        example: 'ufCrm23',
    })
    @IsString()
    @IsOptional()
    bitrixCamelId?: string;

    @ApiPropertyOptional({
        description: 'Category code',
        example: 'category_code',
    })
    @IsString()
    @IsOptional()
    code?: string;

    @ApiPropertyOptional({
        description: 'Is active',
        example: true,
    })
    @IsBoolean()
    @IsOptional()
    isActive?: boolean;
}

