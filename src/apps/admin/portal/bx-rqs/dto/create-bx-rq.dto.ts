import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class CreateBxRqDto {
    @ApiPropertyOptional({
        description: 'Portal ID',
        example: 1,
    })
    @IsNumber()
    @IsOptional()
    portal_id?: number;

    @ApiPropertyOptional({
        description: 'RQ name',
        example: 'RQ Name',
    })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional({
        description: 'RQ code',
        example: 'RQ_CODE',
    })
    @IsString()
    @IsOptional()
    code?: string;

    @ApiPropertyOptional({
        description: 'RQ type',
        example: 'type',
    })
    @IsString()
    @IsOptional()
    type?: string;

    @ApiPropertyOptional({
        description: 'Bitrix ID',
        example: 'bitrix_id_123',
    })
    @IsString()
    @IsOptional()
    bitrix_id?: string;

    @ApiPropertyOptional({
        description: 'XML ID',
        example: 'xml_id_123',
    })
    @IsString()
    @IsOptional()
    xml_id?: string;

    @ApiPropertyOptional({
        description: 'Entity Type ID',
        example: '134',
    })
    @IsString()
    @IsOptional()
    entity_type_id?: string;

    @ApiPropertyOptional({
        description: 'Country ID',
        example: '1',
    })
    @IsString()
    @IsOptional()
    country_id?: string;

    @ApiPropertyOptional({
        description: 'Is active',
        example: true,
        default: true,
    })
    @IsBoolean()
    @IsOptional()
    is_active?: boolean;

    @ApiPropertyOptional({
        description: 'Sort order',
        example: 1,
    })
    @IsNumber()
    @IsOptional()
    sort?: number;
}

