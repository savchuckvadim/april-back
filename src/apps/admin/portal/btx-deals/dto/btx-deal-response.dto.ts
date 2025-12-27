import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BtxDealResponseDto {
    @ApiProperty({
        description: 'Deal ID',
        example: 1,
    })
    id: number;

    @ApiProperty({
        description: 'Deal name',
        example: 'Deal Name',
    })
    name: string;

    @ApiProperty({
        description: 'Deal title',
        example: 'Deal Title',
    })
    title: string;

    @ApiProperty({
        description: 'Deal code',
        example: 'DEAL_CODE',
    })
    code: string;

    @ApiProperty({
        description: 'Portal ID',
        example: 1,
    })
    portal_id: number;

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

