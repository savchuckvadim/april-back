import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray, ValidateNested, IsEnum, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { BitrixFieldEntityType } from '../../bitrixfields/enums/bitrixfield-entity-type.enum';
import { CreateBtxStageDto } from './create-btx-stage.dto';

export class CreateBtxCategoryDto {
    @ApiProperty({
        description: 'Entity type (polymorphic relation)',
        example: BitrixFieldEntityType.DEAL,
        enum: BitrixFieldEntityType,
    })
    @IsEnum(BitrixFieldEntityType)
    @IsNotEmpty()
    entity_type: BitrixFieldEntityType;

    @ApiProperty({
        description: 'Entity ID (polymorphic relation)',
        example: 1,
    })
    @IsNumber()
    @IsNotEmpty()
    entity_id: number;

    @ApiProperty({
        description: 'Parent type for grouping categories',
        example: 'cold',
    })
    @IsString()
    @IsNotEmpty()
    parent_type: string;

    @ApiProperty({
        description: 'Category type',
        example: 'deal',
    })
    @IsString()
    @IsNotEmpty()
    type: string;

    @ApiProperty({
        description: 'Category group',
        example: 'sales',
    })
    @IsString()
    @IsNotEmpty()
    group: string;

    @ApiProperty({
        description: 'Category title',
        example: 'Category Title',
    })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({
        description: 'Category name',
        example: 'category_name',
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Bitrix ID',
        example: '23',
    })
    @IsString()
    @IsNotEmpty()
    bitrixId: string;

    @ApiProperty({
        description: 'Bitrix Camel ID',
        example: 'ufCrm23',
    })
    @IsString()
    @IsNotEmpty()
    bitrixCamelId: string;

    @ApiProperty({
        description: 'Category code',
        example: 'category_code',
    })
    @IsString()
    @IsNotEmpty()
    code: string;

    @ApiProperty({
        description: 'Is active',
        example: true,
    })
    @IsBoolean()
    @IsNotEmpty()
    isActive: boolean;

    @ApiPropertyOptional({
        description: 'Category stages',
        type: [CreateBtxStageDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateBtxStageDto)
    @IsOptional()
    stages?: CreateBtxStageDto[];
}

