import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateMeasureDto {
    @ApiProperty({
        description: 'Measure name',
        example: 'Measure Name',
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Measure short name',
        example: 'Short Name',
    })
    @IsString()
    @IsNotEmpty()
    shortName: string;

    @ApiProperty({
        description: 'Measure full name',
        example: 'Full Measure Name',
    })
    @IsString()
    @IsNotEmpty()
    fullName: string;

    @ApiProperty({
        description: 'Measure code',
        example: 'MEASURE_CODE',
    })
    @IsString()
    @IsNotEmpty()
    code: string;

    @ApiPropertyOptional({
        description: 'Measure type',
        example: 'type',
    })
    @IsString()
    @IsOptional()
    type?: string;
}

