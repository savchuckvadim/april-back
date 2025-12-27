import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ContractResponseDto {
    @ApiProperty({
        description: 'Contract ID',
        example: 1,
    })
    id: number;

    @ApiProperty({
        description: 'Contract name',
        example: 'Contract Name',
    })
    name: string;

    @ApiProperty({
        description: 'Contract number',
        example: 1,
    })
    number: number;

    @ApiProperty({
        description: 'Contract title',
        example: 'Contract Title',
    })
    title: string;

    @ApiProperty({
        description: 'Contract code',
        example: 'CONTRACT_CODE',
    })
    code: string;

    @ApiProperty({
        description: 'Contract type',
        example: 'type',
    })
    type: string;

    @ApiProperty({
        description: 'With prepayment',
        example: true,
    })
    withPrepayment: boolean;

    @ApiPropertyOptional({
        description: 'Template',
        example: 'template',
    })
    template?: string | null;

    @ApiPropertyOptional({
        description: 'Order',
        example: 1,
    })
    order?: number | null;

    @ApiPropertyOptional({
        description: 'Coefficient',
        example: 1,
    })
    coefficient?: number;

    @ApiPropertyOptional({
        description: 'Prepayment',
        example: 1,
    })
    prepayment?: number;

    @ApiPropertyOptional({
        description: 'Discount',
        example: 1.0,
    })
    discount?: number;

    @ApiPropertyOptional({
        description: 'Product name',
        example: 'Product Name',
    })
    productName?: string | null;

    @ApiPropertyOptional({
        description: 'Product',
        example: 'Product',
    })
    product?: string | null;

    @ApiPropertyOptional({
        description: 'Service',
        example: 'Service',
    })
    service?: string | null;

    @ApiPropertyOptional({
        description: 'Description',
        example: 'Description text',
    })
    description?: string | null;

    @ApiPropertyOptional({
        description: 'Comment',
        example: 'Comment text',
    })
    comment?: string | null;

    @ApiPropertyOptional({
        description: 'Comment 1',
        example: 'Comment 1 text',
    })
    comment1?: string | null;

    @ApiPropertyOptional({
        description: 'Comment 2',
        example: 'Comment 2 text',
    })
    comment2?: string | null;

    @ApiPropertyOptional({
        description: 'Created at',
        example: '2024-01-01T00:00:00.000Z',
    })
    created_at?: Date | null;

    @ApiPropertyOptional({
        description: 'Updated at',
        example: '2024-01-01T00:00:00.000Z',
    })
    updated_at?: Date | null;
}

