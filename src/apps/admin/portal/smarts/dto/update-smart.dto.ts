import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';

export class UpdateSmartDto {
    @ApiPropertyOptional({
        description: 'Smart type',
        example: 'type',
    })
    @IsString()
    @IsOptional()
    type?: string;

    @ApiPropertyOptional({
        description: 'Smart group',
        example: 'group',
    })
    @IsString()
    @IsOptional()
    group?: string;

    @ApiPropertyOptional({
        description: 'Smart name',
        example: 'Smart Name',
    })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional({
        description: 'Smart title',
        example: 'Smart Title',
    })
    @IsString()
    @IsOptional()
    title?: string;

    @ApiPropertyOptional({
        description: 'Entity Type ID',
        example: 134,
    })
    @IsNumber()
    @IsOptional()
    entityTypeId?: number;

    @ApiPropertyOptional({
        description: 'Portal ID',
        example: 1,
    })
    @IsNumber()
    @IsOptional()
    portal_id?: number;

    @ApiPropertyOptional({
        description: 'Bitrix ID',
        example: 123,
    })
    @IsNumber()
    @IsOptional()
    bitrixId?: number;

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

    @ApiPropertyOptional({
        description: 'For Stage',
        example: 'DT134_',
    })
    @IsString()
    @IsOptional()
    forStage?: string;

    @ApiPropertyOptional({
        description: 'For Filter',
        example: 'DYNAMIC_134_',
    })
    @IsString()
    @IsOptional()
    forFilter?: string;

    @ApiPropertyOptional({
        description: 'CRM',
        example: 'T9c_',
    })
    @IsString()
    @IsOptional()
    crm?: string;
}

