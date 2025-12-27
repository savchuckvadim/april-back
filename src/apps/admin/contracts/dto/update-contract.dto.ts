import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class UpdateContractDto {
    @ApiPropertyOptional({
        description: 'Contract name',
        example: 'Contract Name',
    })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional({
        description: 'Contract number',
        example: 1,
    })
    @IsNumber()
    @IsOptional()
    number?: number;

    @ApiPropertyOptional({
        description: 'Contract title',
        example: 'Contract Title',
    })
    @IsString()
    @IsOptional()
    title?: string;

    @ApiPropertyOptional({
        description: 'Contract code',
        example: 'CONTRACT_CODE',
    })
    @IsString()
    @IsOptional()
    code?: string;

    @ApiPropertyOptional({
        description: 'Contract type',
        example: 'type',
    })
    @IsString()
    @IsOptional()
    type?: string;

    @ApiPropertyOptional({
        description: 'With prepayment',
        example: true,
    })
    @IsBoolean()
    @IsOptional()
    withPrepayment?: boolean;

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
        description: 'Coefficient',
        example: 1,
    })
    @IsNumber()
    @IsOptional()
    coefficient?: number;

    @ApiPropertyOptional({
        description: 'Prepayment',
        example: 1,
    })
    @IsNumber()
    @IsOptional()
    prepayment?: number;

    @ApiPropertyOptional({
        description: 'Discount',
        example: 1.0,
    })
    @IsNumber()
    @IsOptional()
    discount?: number;

    @ApiPropertyOptional({
        description: 'Product name',
        example: 'Product Name',
    })
    @IsString()
    @IsOptional()
    productName?: string;

    @ApiPropertyOptional({
        description: 'Product',
        example: 'Product',
    })
    @IsString()
    @IsOptional()
    product?: string;

    @ApiPropertyOptional({
        description: 'Service',
        example: 'Service',
    })
    @IsString()
    @IsOptional()
    service?: string;

    @ApiPropertyOptional({
        description: 'Description',
        example: 'Description text',
    })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiPropertyOptional({
        description: 'Comment',
        example: 'Comment text',
    })
    @IsString()
    @IsOptional()
    comment?: string;

    @ApiPropertyOptional({
        description: 'Comment 1',
        example: 'Comment 1 text',
    })
    @IsString()
    @IsOptional()
    comment1?: string;

    @ApiPropertyOptional({
        description: 'Comment 2',
        example: 'Comment 2 text',
    })
    @IsString()
    @IsOptional()
    comment2?: string;
}

