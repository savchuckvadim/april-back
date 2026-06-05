import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';

export class CreatePortalSmartDto {
    @ApiProperty({ description: 'Portal ID (our DB)', example: 1 })
    @IsNumber()
    @Min(1)
    portalId: number;

    @ApiProperty({ example: 'sales' })
    @IsString()
    @IsNotEmpty()
    type: string;

    @ApiProperty({ example: 'cold' })
    @IsString()
    @IsNotEmpty()
    group: string;

    @ApiProperty({ example: 'Sales smart' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ example: 'Sales smart' })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({
        description: 'Bitrix smart-process numeric id',
        example: 128,
    })
    @IsNumber()
    @IsOptional()
    bitrixId?: number;

    @ApiProperty({ description: 'Bitrix entityTypeId', example: 1046 })
    @IsNumber()
    @Min(1)
    entityTypeId: number;

    @ApiPropertyOptional({ example: 1046 })
    @IsNumber()
    @IsOptional()
    forStageId?: number;

    @ApiPropertyOptional({ example: 1046 })
    @IsNumber()
    @IsOptional()
    forFilterId?: number;

    @ApiPropertyOptional({ example: 1046 })
    @IsNumber()
    @IsOptional()
    crmId?: number;

    @ApiPropertyOptional({ example: 'DT1046_' })
    @IsString()
    @IsOptional()
    forStage?: string;

    @ApiPropertyOptional({ example: 'DYNAMIC_1046_' })
    @IsString()
    @IsOptional()
    forFilter?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    crm?: string;
}
