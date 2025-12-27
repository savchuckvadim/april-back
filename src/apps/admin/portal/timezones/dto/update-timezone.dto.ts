import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';

export class UpdateTimezoneDto {
    @ApiPropertyOptional({
        description: 'Timezone name',
        example: 'UTC',
    })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional({
        description: 'Timezone title',
        example: 'UTC Timezone',
    })
    @IsString()
    @IsOptional()
    title?: string;

    @ApiPropertyOptional({
        description: 'Timezone value',
        example: 'UTC',
    })
    @IsString()
    @IsOptional()
    value?: string;

    @ApiPropertyOptional({
        description: 'Portal ID',
        example: 1,
    })
    @IsNumber()
    @IsOptional()
    portal_id?: number;

    @ApiPropertyOptional({
        description: 'Timezone type',
        example: 'type',
    })
    @IsString()
    @IsOptional()
    type?: string;

    @ApiPropertyOptional({
        description: 'Timezone offset',
        example: '+00:00',
    })
    @IsString()
    @IsOptional()
    offset?: string;
}

