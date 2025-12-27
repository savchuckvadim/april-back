import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class CreatePortalContractDto {
    @ApiProperty({
        description: 'Portal ID',
        example: 1,
    })
    @IsNumber()
    @IsNotEmpty()
    portal_id: number;

    @ApiProperty({
        description: 'Contract ID',
        example: 1,
    })
    @IsNumber()
    @IsNotEmpty()
    contract_id: number;

    @ApiProperty({
        description: 'Portal Measure ID',
        example: 1,
    })
    @IsNumber()
    @IsNotEmpty()
    portal_measure_id: number;

    @ApiProperty({
        description: 'Bitrix Field Item ID',
        example: 1,
    })
    @IsNumber()
    @IsNotEmpty()
    bitrixfield_item_id: number;

    @ApiProperty({
        description: 'Title',
        example: 'Portal Contract Title',
    })
    @IsString()
    @IsNotEmpty()
    title: string;

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

