import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class CreatePortalMeasureDto {
    @ApiProperty({
        description: 'Measure ID',
        example: 1,
    })
    @IsNumber()
    @IsNotEmpty()
    measure_id: number;

    @ApiProperty({
        description: 'Portal ID',
        example: 1,
    })
    @IsNumber()
    @IsNotEmpty()
    portal_id: number;

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

