import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PortalMeasureResponseDto {
    @ApiProperty({
        description: 'Portal Measure ID',
        example: 1,
    })
    id: number;

    @ApiProperty({
        description: 'Measure ID',
        example: 1,
    })
    measure_id: number;

    @ApiProperty({
        description: 'Portal ID',
        example: 1,
    })
    portal_id: number;

    @ApiPropertyOptional({
        description: 'Bitrix ID',
        example: 'bitrix_id_123',
    })
    bitrixId?: string | null;

    @ApiPropertyOptional({
        description: 'Name',
        example: 'Measure Name',
    })
    name?: string | null;

    @ApiPropertyOptional({
        description: 'Short name',
        example: 'Short Name',
    })
    shortName?: string | null;

    @ApiPropertyOptional({
        description: 'Full name',
        example: 'Full Measure Name',
    })
    fullName?: string | null;

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

