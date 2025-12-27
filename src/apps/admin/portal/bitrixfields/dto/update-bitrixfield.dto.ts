import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';

export class UpdateBitrixFieldDto {
    @ApiPropertyOptional({
        description: 'Parent type for grouping fields',
        example: 'list',
    })
    @IsString()
    @IsOptional()
    parent_type?: string;

    @ApiPropertyOptional({
        description: 'Field type',
        example: 'select',
    })
    @IsString()
    @IsOptional()
    type?: string;

    @ApiPropertyOptional({
        description: 'Field title',
        example: 'Field Title',
    })
    @IsString()
    @IsOptional()
    title?: string;

    @ApiPropertyOptional({
        description: 'Field name',
        example: 'field_name',
    })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional({
        description: 'Bitrix ID',
        example: 'UF_CRM_123',
    })
    @IsString()
    @IsOptional()
    bitrixId?: string;

    @ApiPropertyOptional({
        description: 'Bitrix Camel ID',
        example: 'ufCrm123',
    })
    @IsString()
    @IsOptional()
    bitrixCamelId?: string;

    @ApiPropertyOptional({
        description: 'Field code',
        example: 'field_code',
    })
    @IsString()
    @IsOptional()
    code?: string;
}

