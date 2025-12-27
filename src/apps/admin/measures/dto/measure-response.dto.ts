import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MeasureResponseDto {
    @ApiProperty({
        description: 'Measure ID',
        example: 1,
    })
    id: number;

    @ApiProperty({
        description: 'Measure name',
        example: 'Measure Name',
    })
    name: string;

    @ApiProperty({
        description: 'Measure short name',
        example: 'Short Name',
    })
    shortName: string;

    @ApiProperty({
        description: 'Measure full name',
        example: 'Full Measure Name',
    })
    fullName: string;

    @ApiProperty({
        description: 'Measure code',
        example: 'MEASURE_CODE',
    })
    code: string;

    @ApiPropertyOptional({
        description: 'Measure type',
        example: 'type',
    })
    type?: string | null;

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

