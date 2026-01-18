import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { timezones } from 'generated/prisma';

export class TimezoneResponseDto {
    constructor(timezone: timezones) {
        this.id = Number(timezone.id);
        this.name = timezone.name;
        this.title = timezone.title;
        this.value = timezone.value;
        this.portal_id = Number(timezone.portal_id);
        this.type = timezone.type;
        this.offset = timezone.offset;

    }
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

