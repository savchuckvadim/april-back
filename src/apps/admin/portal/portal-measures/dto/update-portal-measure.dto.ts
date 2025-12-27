import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';

export class UpdatePortalMeasureDto {
    @ApiPropertyOptional({
        description: 'Measure ID',
        example: 1,
    })
    @IsNumber()
    @IsOptional()
    measure_id?: number;

    @ApiPropertyOptional({
        description: 'Portal ID',
        example: 1,
    })
    @IsNumber()
    @IsOptional()
    portal_id?: number;

    @ApiPropertyOptional({
        description: 'Bitrix ID',
        example: 'bitrix_id_123',
    })
    @IsString()
    @IsOptional()
    bitrixId?: string;

    @ApiPropertyOptional({
        description: 'Name',
        example: 'Measure Name',
    })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional({
        description: 'Short name',
        example: 'Short Name',
    })
    @IsString()
    @IsOptional()
    shortName?: string;

    @ApiPropertyOptional({
        description: 'Full name',
        example: 'Full Measure Name',
    })
    @IsString()
    @IsOptional()
    fullName?: string;
}

