import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class CreateTimezoneDto {
    @ApiProperty({
        description: 'Timezone name',
        example: 'UTC',
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Timezone title',
        example: 'UTC Timezone',
    })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({
        description: 'Timezone value',
        example: 'UTC',
    })
    @IsString()
    @IsNotEmpty()
    value: string;

    @ApiProperty({
        description: 'Portal ID',
        example: 1,
    })
    @IsNumber()
    @IsNotEmpty()
    portal_id: number;

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

