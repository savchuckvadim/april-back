import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BitrixFieldItemResponseDto {
    @ApiProperty({
        description: 'Item ID',
        example: 1,
    })
    id: number;

    @ApiProperty({
        description: 'Bitrix Field ID',
        example: 1,
    })
    bitrixfield_id: number;

    @ApiProperty({
        description: 'Item name',
        example: 'item_name',
    })
    name: string;

    @ApiProperty({
        description: 'Item title',
        example: 'Item Title',
    })
    title: string;

    @ApiProperty({
        description: 'Item code',
        example: 'item_code',
    })
    code: string;

    @ApiProperty({
        description: 'Bitrix ID',
        example: 1,
    })
    bitrixId: number;

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

