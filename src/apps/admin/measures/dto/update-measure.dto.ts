import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class UpdateMeasureDto {
    @ApiPropertyOptional({
        description: 'Measure name',
        example: 'Measure Name',
    })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional({
        description: 'Measure short name',
        example: 'Short Name',
    })
    @IsString()
    @IsOptional()
    shortName?: string;

    @ApiPropertyOptional({
        description: 'Measure full name',
        example: 'Full Measure Name',
    })
    @IsString()
    @IsOptional()
    fullName?: string;

    @ApiPropertyOptional({
        description: 'Measure code',
        example: 'MEASURE_CODE',
    })
    @IsString()
    @IsOptional()
    code?: string;

    @ApiPropertyOptional({
        description: 'Measure type',
        example: 'type',
    })
    @IsString()
    @IsOptional()
    type?: string;
}

