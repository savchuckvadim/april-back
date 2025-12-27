import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class CreateSmartDto {
    @ApiProperty({
        description: 'Smart type',
        example: 'type',
    })
    @IsString()
    @IsNotEmpty()
    type: string;

    @ApiProperty({
        description: 'Smart group',
        example: 'group',
    })
    @IsString()
    @IsNotEmpty()
    group: string;

    @ApiProperty({
        description: 'Smart name',
        example: 'Smart Name',
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Smart title',
        example: 'Smart Title',
    })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({
        description: 'Entity Type ID',
        example: 134,
    })
    @IsNumber()
    @IsNotEmpty()
    entityTypeId: number;

    @ApiProperty({
        description: 'Portal ID',
        example: 1,
    })
    @IsNumber()
    @IsNotEmpty()
    portal_id: number;

    @ApiPropertyOptional({
        description: 'Bitrix ID',
        example: 123,
    })
    @IsNumber()
    bitrixId: number;

    @ApiPropertyOptional({
        description: 'For Stage ID',
        example: 1,
    })
    @IsNumber()
    forStageId: number;

    @ApiPropertyOptional({
        description: 'For Filter ID',
        example: 1,
    })
    @IsNumber()
    forFilterId: number;

    @ApiPropertyOptional({
        description: 'CRM ID',
        example: 1,
    })
    @IsNumber()
    crmId: number;

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

