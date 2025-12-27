import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional, IsBoolean } from 'class-validator';

export class CreateContractDto {
    @ApiProperty({
        description: 'Contract name',
        example: 'Contract Name',
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Contract number',
        example: 1,
    })
    @IsNumber()
    @IsNotEmpty()
    number: number;

    @ApiProperty({
        description: 'Contract title',
        example: 'Contract Title',
    })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({
        description: 'Contract code',
        example: 'CONTRACT_CODE',
    })
    @IsString()
    @IsNotEmpty()
    code: string;

    @ApiProperty({
        description: 'Contract type',
        example: 'type',
    })
    @IsString()
    @IsNotEmpty()
    type: string;

    @ApiProperty({
        description: 'With prepayment',
        example: true,
    })
    @IsBoolean()
    @IsNotEmpty()
    withPrepayment: boolean;

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
        default: 1,
    })
    @IsNumber()
    @IsOptional()
    coefficient?: number;

    @ApiPropertyOptional({
        description: 'Prepayment',
        example: 1,
        default: 1,
    })
    @IsNumber()
    @IsOptional()
    prepayment?: number;

    @ApiPropertyOptional({
        description: 'Discount',
        example: 1.0,
        default: 1.0,
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

