import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TimezoneResponseDto {
    @ApiProperty({
        description: 'Timezone ID',
        example: 1,
    })
    id: number;

    @ApiProperty({
        description: 'Timezone name',
        example: 'UTC',
    })
    name: string;

    @ApiProperty({
        description: 'Timezone title',
        example: 'UTC Timezone',
    })
    title: string;

    @ApiProperty({
        description: 'Timezone value',
        example: 'UTC',
    })
    value: string;

    @ApiProperty({
        description: 'Portal ID',
        example: 1,
    })
    portal_id: number;

    @ApiPropertyOptional({
        description: 'Timezone type',
        example: 'type',
    })
    type?: string | null;

    @ApiPropertyOptional({
        description: 'Timezone offset',
        example: '+00:00',
    })
    offset?: string | null;
}

