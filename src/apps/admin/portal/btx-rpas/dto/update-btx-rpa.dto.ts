import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';

export class UpdateBtxRpaDto {
    @ApiPropertyOptional({
        description: 'RPA name',
        example: 'RPA Name',
    })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional({
        description: 'RPA title',
        example: 'RPA Title',
    })
    @IsString()
    @IsOptional()
    title?: string;

    @ApiPropertyOptional({
        description: 'RPA code',
        example: 'RPA_CODE',
    })
    @IsString()
    @IsOptional()
    code?: string;

    @ApiPropertyOptional({
        description: 'RPA type',
        example: 'type',
    })
    @IsString()
    @IsOptional()
    type?: string;

    @ApiPropertyOptional({
        description: 'Type ID',
        example: 'typeId',
    })
    @IsString()
    @IsOptional()
    typeId?: string;

    @ApiPropertyOptional({
        description: 'Portal ID',
        example: 1,
    })
    @IsNumber()
    @IsOptional()
    portal_id?: number;

    @ApiPropertyOptional({
        description: 'Image',
        example: 'image.png',
    })
    @IsString()
    @IsOptional()
    image?: string;

    @ApiPropertyOptional({
        description: 'Bitrix ID',
        example: 123,
    })
    @IsNumber()
    @IsOptional()
    bitrixId?: number;

    @ApiPropertyOptional({
        description: 'Description',
        example: 'Description text',
    })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiPropertyOptional({
        description: 'Entity Type ID',
        example: 134,
    })
    @IsNumber()
    @IsOptional()
    entityTypeId?: number;

    @ApiPropertyOptional({
        description: 'For Stage ID',
        example: 1,
    })
    @IsNumber()
    @IsOptional()
    forStageId?: number;

    @ApiPropertyOptional({
        description: 'For Filter ID',
        example: 1,
    })
    @IsNumber()
    @IsOptional()
    forFilterId?: number;

    @ApiPropertyOptional({
        description: 'CRM ID',
        example: 1,
    })
    @IsNumber()
    @IsOptional()
    crmId?: number;
}

