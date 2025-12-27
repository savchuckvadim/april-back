import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BtxStageResponseDto {
    @ApiProperty({
        description: 'Stage ID',
        example: 1,
    })
    id: number;

    @ApiProperty({
        description: 'Category ID',
        example: 1,
    })
    btx_category_id: number;

    @ApiProperty({
        description: 'Stage name',
        example: 'stage_name',
    })
    name: string;

    @ApiProperty({
        description: 'Stage title',
        example: 'Stage Title',
    })
    title: string;

    @ApiProperty({
        description: 'Stage code',
        example: 'stage_code',
    })
    code: string;

    @ApiProperty({
        description: 'Bitrix ID',
        example: 'DT134_1',
    })
    bitrixId: string;

    @ApiProperty({
        description: 'Stage color',
        example: '#FF0000',
    })
    color: string;

    @ApiProperty({
        description: 'Is active',
        example: true,
    })
    isActive: boolean;

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

