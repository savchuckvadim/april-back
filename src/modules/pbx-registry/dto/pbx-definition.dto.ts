import { PbxEntityType } from '@/shared/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';

/**
 * Item (enumeration value) within a field definition.
 */
export class PbxFieldItemDefinitionDto {
    @ApiProperty({
        description: 'Item code',
        example: 'item_code',
    })
    @IsString()
    @IsNotEmpty()
    code: string;

    @ApiProperty({
        description: 'Item value',
        example: 'item_value',
    })
    @IsString()
    @IsNotEmpty()
    value: string;

    @ApiProperty({
        description: 'Item sort',
        example: 1,
    })
    @IsNumber()
    @IsNotEmpty()
    sort: number;

    @ApiProperty({
        description: 'Item XML ID',
        example: 'item_xml_id',
    })
    @IsString()
    @IsOptional()
    xmlId?: string;

    @ApiProperty({
        description: 'Item delete flag',
        example: 'Y',
    })
    @IsString()
    @IsOptional()
    del?: 'Y' | 'N';
}

/**
 * Field definition — the application's source of truth for a Bitrix user field.
 *
 * - `code` is the stable application key (e.g., 'xo_name')
 * - `suffix` maps to the Bitrix field name suffix per entity
 *   For CRM entities: UF_CRM_{SUFFIX} (e.g., UF_CRM_XO_NAME)
 *   For smart processes: UF_CRM_{entityTypeId}_{SUFFIX} (e.g., UF_CRM_134_XO_NAME)
 */
export class PbxFieldDefinitionDto {
    @ApiProperty({
        description: 'Field code',
        example: 'field_code',
    })
    @IsString()
    @IsNotEmpty()
    code: string;

    @ApiProperty({
        description: 'Field name',
        example: 'field_name',
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Field type',
        example: 'select',
    })
    @IsString()
    @IsNotEmpty()
    type: string;

    @ApiProperty({
        description: 'Field is multiple',
        example: true,
    })
    @IsBoolean()
    @IsNotEmpty()
    isMultiple: boolean;

    @ApiProperty({
        description: 'Field order',
        example: 1,
    })
    @IsNumber()
    @IsOptional()
    order?: number;

    @ApiProperty({
        description: 'Field app type',
        example: 'app_type',
    })
    @IsString()
    @IsOptional()
    appType?: string;

    /**
     * Suffix per entity type. Empty string = field not installed on this entity.
     * For CRM entities, this is the FIELD_NAME suffix after UF_CRM_.
     * For smart processes, entityTypeId is prepended at install time.
     */
    @IsObject()
    @IsOptional()
    suffixes?: Partial<Record<PbxEntityType, string>>;

    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PbxFieldItemDefinitionDto)
    items?: PbxFieldItemDefinitionDto[];
}

/**
 * Stage definition within a category.
 */
export class PbxStageDefinitionDto {
    readonly code: string;
    @IsString()
    @IsNotEmpty()
    name: string;
    @IsString()
    @IsOptional()
    color?: string;
    @IsNumber()
    @IsNotEmpty()
    sort: number;
    @IsBoolean()
    @IsOptional()
    isDefault?: boolean;
    @IsString()
    @IsOptional()
    semantics?: string;
}

/**
 * Category definition — a direction (воронка) within a CRM entity.
 */
export class PbxCategoryDefinitionDto {
    readonly code: string;
    @IsString()
    @IsNotEmpty()
    name: string;
    @IsNumber()
    @IsNotEmpty()
    sort: number;
    @IsEnum(PbxEntityType)
    @IsNotEmpty()
    entityType: PbxEntityType;
    @IsBoolean()
    @IsOptional()
    isDefault?: boolean;
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PbxStageDefinitionDto)
    stages: PbxStageDefinitionDto[];
}

/**
 * Smart Process definition. `entityTypeId` is unknown until Bitrix assigns it.
 */
export class PbxSmartDefinitionDto {
    @IsString()
    @IsNotEmpty()
    code: string;
    @IsString()
    @IsNotEmpty()
    title: string;
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PbxCategoryDefinitionDto)
    categories?: PbxCategoryDefinitionDto[];

    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PbxFieldDefinitionDto)
    fields?: PbxFieldDefinitionDto[];
}

/**
 * RPA definition.
 */
export class PbxRpaDefinitionDto {
    @IsString()
    @IsNotEmpty()
    code: string;
    @IsString()
    @IsNotEmpty()
    title: string;
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PbxStageDefinitionDto)
    stages?: PbxStageDefinitionDto[];
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PbxFieldDefinitionDto)
    fields?: PbxFieldDefinitionDto[];
}

/**
 * Full entity group definition — all fields, categories, stages for a group (e.g., "sales").
 */
export class PbxGroupDefinitionDto {
    readonly group: string;
    @IsString()
    @IsOptional()
    appType?: string;

    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PbxFieldDefinitionDto)
    fields: PbxFieldDefinitionDto[];
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PbxCategoryDefinitionDto)
    categories: PbxCategoryDefinitionDto[];
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PbxSmartDefinitionDto)
    smarts?: PbxSmartDefinitionDto[];
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PbxRpaDefinitionDto)
    rpas?: PbxRpaDefinitionDto[];
}
