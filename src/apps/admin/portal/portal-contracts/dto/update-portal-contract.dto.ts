import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';

export class UpdatePortalContractDto {
    @ApiPropertyOptional({
        description: 'Portal ID',
        example: 1,
    })
    @IsNumber()
    @IsOptional()
    portal_id?: number;

    @ApiPropertyOptional({
        description: 'Contract ID',
        example: 1,
    })
    @IsNumber()
    @IsOptional()
    contract_id?: number;

    @ApiPropertyOptional({
        description: 'Portal Measure ID',
        example: 1,
    })
    @IsNumber()
    @IsOptional()
    portal_measure_id?: number;

    @ApiPropertyOptional({
        description: 'Bitrix Field Item ID',
        example: 1,
    })
    @IsNumber()
    @IsOptional()
    bitrixfield_item_id?: number;

    @ApiPropertyOptional({
        description: 'Title',
        example: 'Portal Contract Title',
    })
    @IsString()
    @IsOptional()
    title?: string;

    @ApiPropertyOptional({
        description: 'Template',
        example: 'template',
    })
    @IsString()
    @IsOptional()
    template?: string;

    @ApiPropertyOptional({
        description: 'Order',
        example: 1,
    })
    @IsNumber()
    @IsOptional()
    order?: number;

    @ApiPropertyOptional({
        description: 'Product name',
        example: 'Product Name',
    })
    @IsString()
    @IsOptional()
    productName?: string;

    @ApiPropertyOptional({
        description: 'Description',
        example: 'Description text',
    })
    @IsString()
    @IsOptional()
    description?: string;
}

