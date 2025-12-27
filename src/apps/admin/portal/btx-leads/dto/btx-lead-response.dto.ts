import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BtxLeadResponseDto {
    @ApiProperty({
        description: 'Lead ID',
        example: 1,
    })
    id: number;

    @ApiProperty({
        description: 'Lead name',
        example: 'Lead Name',
    })
    name: string;

    @ApiProperty({
        description: 'Lead title',
        example: 'Lead Title',
    })
    title: string;

    @ApiProperty({
        description: 'Lead code',
        example: 'LEAD_CODE',
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

