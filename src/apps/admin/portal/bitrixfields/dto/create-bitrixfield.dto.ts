import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateBitrixFieldItemDto } from './create-bitrixfield-item.dto';
import { BitrixFieldEntityType } from '../enums/bitrixfield-entity-type.enum';

export class CreateBitrixFieldDto {
    @ApiProperty({
        description: 'Entity type (polymorphic relation)',
        example: BitrixFieldEntityType.SMART,
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
        description: 'Parent type for grouping fields',
        example: 'list',
    })
    @IsString()
    @IsNotEmpty()
    parent_type: string;

    @ApiProperty({
        description: 'Field type',
        example: 'select',
    })
    @IsString()
    @IsNotEmpty()
    type: string;

    @ApiProperty({
        description: 'Field title',
        example: 'Field Title',
    })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({
        description: 'Field name',
        example: 'field_name',
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Bitrix ID',
        example: 'UF_CRM_123',
    })
    @IsString()
    @IsNotEmpty()
    bitrixId: string;

    @ApiProperty({
        description: 'Bitrix Camel ID',
        example: 'ufCrm123',
    })
    @IsString()
    @IsNotEmpty()
    bitrixCamelId: string;

    @ApiProperty({
        description: 'Field code',
        example: 'field_code',
    })
    @IsString()
    @IsNotEmpty()
    code: string;

    @ApiPropertyOptional({
        description: 'Field items (for select, multiselect, etc.)',
        type: [CreateBitrixFieldItemDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateBitrixFieldItemDto)
    @IsOptional()
    items?: CreateBitrixFieldItemDto[];
}

