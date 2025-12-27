import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PortalContractResponseDto {
    @ApiProperty({
        description: 'Portal Contract ID',
        example: 1,
    })
    id: number;

    @ApiProperty({
        description: 'Portal ID',
        example: 1,
    })
    portal_id: number;

    @ApiProperty({
        description: 'Contract ID',
        example: 1,
    })
    contract_id: number;

    @ApiProperty({
        description: 'Portal Measure ID',
        example: 1,
    })
    portal_measure_id: number;

    @ApiProperty({
        description: 'Bitrix Field Item ID',
        example: 1,
    })
    bitrixfield_item_id: number;

    @ApiProperty({
        description: 'Title',
        example: 'Portal Contract Title',
    })
    title: string;

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
        description: 'Product name',
        example: 'Product Name',
    })
    productName?: string | null;

    @ApiPropertyOptional({
        description: 'Description',
        example: 'Description text',
    })
    description?: string | null;

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

