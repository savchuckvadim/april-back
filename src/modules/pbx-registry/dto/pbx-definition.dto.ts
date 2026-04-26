import { PbxEntityType } from '@/shared/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsIn,
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
const YN_VALUES = ['Y', 'N'] as const;

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
        type: String,
    })
    @IsString()
    @IsOptional()
    xmlId?: string;

    @ApiProperty({
        description: 'Item delete flag',
        example: 'Y',
        type: String,
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
        type: Number,
    })
    @IsNumber()
    @IsOptional()
    order?: number;

    @ApiProperty({
        description: 'Field app type',
        example: 'app_type',
        type: String,
    })
    @IsString()
    @IsOptional()
    appType?: string;

    @ApiProperty({
        description: 'Single target RPA code',
        example: 'pres',
        type: String,
    })
    @IsString()
    @IsOptional()
    rpa?: string;

    @ApiProperty({
        description: 'Target RPA codes',
        example: ['pres', 'supply'],
        type: [String],
    })
    @IsArray()
    @IsOptional()
    @IsString({ each: true })
    rpas?: string[];

    @ApiProperty({
        description: 'Single target smart code',
        example: 'report',
        type: String,
    })
    @IsString()
    @IsOptional()
    smart?: string;

    @ApiProperty({
        description: 'Target smart codes',
        example: ['report', 'edu'],
        type: [String],
    })
    @IsArray()
    @IsOptional()
    @IsString({ each: true })
    smarts?: string[];

    @ApiProperty({
        description: 'Single target list code',
        example: 'ork-history',
        type: String,
    })
    @IsString()
    @IsOptional()
    list?: string;

    @ApiProperty({
        description: 'Target list codes',
        example: ['ork-history'],
        type: [String],
    })
    @IsArray()
    @IsOptional()
    @IsString({ each: true })
    lists?: string[];

    @ApiProperty({
        description: 'Single target user code',
        example: 'USER_FIELD',
        type: String,
    })
    @IsString()
    @IsOptional()
    user?: string;

    @ApiProperty({
        description: 'Target user codes',
        example: ['USER_FIELD'],
        type: [String],
    })
    @IsArray()
    @IsOptional()
    @IsString({ each: true })
    users?: string[];

    @ApiProperty({
        description: 'Single target task code',
        example: 'TASK_FIELD',
        type: String,
    })
    @IsString()
    @IsOptional()
    task?: string;

    /**
     * Suffix per entity type. Empty string = field not installed on this entity.
     * For CRM entities, this is the FIELD_NAME suffix after UF_CRM_.
     * For smart processes, entityTypeId is prepended at install time.
     */
    @ApiProperty({
        description: 'Field suffixes by entity type',
        type: Object,
        example: {
            [PbxEntityType.DEAL]: 'XO_FIELD',
            [PbxEntityType.SMART]: 'XO_SMART_FIELD',
        },
    })
    @IsObject()
    @IsOptional()
    suffixes?: Partial<Record<PbxEntityType, string>>;

    @ApiProperty({
        description: 'Field enumeration items',
        type: [PbxFieldItemDefinitionDto],
    })
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
    @ApiProperty({
        description: 'Stage code',
        example: 'new',
        type: String,
    })
    readonly code: string;

    @ApiProperty({
        description: 'Stage name',
        example: 'New',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Stage color',
        example: '#39A8EF',
        type: String,
    })
    @IsString()
    @IsOptional()
    color?: string;

    @ApiProperty({
        description: 'Stage sort order',
        example: 10,
        type: Number,
    })
    @IsNumber()
    @IsNotEmpty()
    sort: number;

    @ApiProperty({
        description: 'Default stage flag',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    @IsOptional()
    isDefault?: boolean;

    @ApiProperty({
        description: 'Stage semantics',
        example: 'S',
        type: String,
    })
    @IsString()
    @IsOptional()
    semantics?: string;
}

/**
 * Category definition — a direction (воронка) within a CRM entity.
 */
export class PbxCategoryDefinitionDto {
    @ApiProperty({
        description: 'Category code',
        example: 'main_funnel',
        type: String,
    })
    readonly code: string;

    @ApiProperty({
        description: 'Category name',
        example: 'Main funnel',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Category sort order',
        example: 10,
        type: Number,
    })
    @IsNumber()
    @IsNotEmpty()
    sort: number;

    @ApiProperty({
        description: 'Category entity type',
        enum: PbxEntityType,
        example: PbxEntityType.DEAL,
    })
    @IsEnum(PbxEntityType)
    @IsNotEmpty()
    entityType: PbxEntityType;

    @ApiProperty({
        description: 'Default category flag',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    @IsOptional()
    isDefault?: boolean;

    @ApiProperty({
        description: 'Category stages',
        type: [PbxStageDefinitionDto],
    })
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PbxStageDefinitionDto)
    stages: PbxStageDefinitionDto[];
}

/**
 * Smart Process definition. `entityTypeId` is unknown until Bitrix assigns it.
 */
export class PbxSmartTypeRelationDto {
    @ApiProperty({
        description: 'Related entity type id',
        type: Number,
        example: 2,
    })
    @IsNumber()
    @IsNotEmpty()
    entityTypeId: number;

    @ApiProperty({
        description: 'Show relation in card',
        type: String,
        example: 'Y',
    })
    @IsString()
    @IsOptional()
    @IsIn(YN_VALUES)
    isChildrenListEnabled?: 'Y' | 'N';
}

export class PbxSmartTypeRelationsDto {
    @ApiProperty({
        description: 'Parent relations',
        type: [PbxSmartTypeRelationDto],
    })
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PbxSmartTypeRelationDto)
    parent?: PbxSmartTypeRelationDto[];

    @ApiProperty({
        description: 'Child relations',
        type: [PbxSmartTypeRelationDto],
    })
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PbxSmartTypeRelationDto)
    child?: PbxSmartTypeRelationDto[];
}

export class PbxSmartInstallSettingsDto {
    @ApiProperty({
        description: 'Smart entityTypeId (if known)',
        example: 134,
        type: Number,
    })
    @IsNumber()
    @IsOptional()
    entityTypeId?: number;

    @ApiProperty({
        description: 'Smart relations settings',
        type: PbxSmartTypeRelationsDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => PbxSmartTypeRelationsDto)
    relations?: PbxSmartTypeRelationsDto;

    @ApiProperty({
        description: 'Linked user fields map',
        type: Object,
        example: {
            'CALENDAR_EVENT|UF_CRM_CAL_EVENT': 'true',
        },
    })
    @IsObject()
    @IsOptional()
    linkedUserFields?: Record<string, string>;

    @ApiProperty({
        description: 'Use in userfield flag',
        type: String,
        example: 'Y',
    })
    @IsString()
    @IsOptional()
    @IsIn(YN_VALUES)
    isUseInUserfieldEnabled?: 'Y' | 'N';

    @ApiProperty({
        description: 'Automation flag',
        type: String,
        example: 'Y',
    })
    @IsString()
    @IsOptional()
    @IsIn(YN_VALUES)
    isAutomationEnabled?: 'Y' | 'N';

    @ApiProperty({
        description: 'Begin/close dates flag',
        type: String,
        example: 'Y',
    })
    @IsString()
    @IsOptional()
    @IsIn(YN_VALUES)
    isBeginCloseDatesEnabled?: 'Y' | 'N';

    @ApiProperty({
        description: 'Bizproc flag',
        type: String,
        example: 'Y',
    })
    @IsString()
    @IsOptional()
    @IsIn(YN_VALUES)
    isBizProcEnabled?: 'Y' | 'N';

    @ApiProperty({
        description: 'Categories enabled flag',
        type: String,
        example: 'Y',
    })
    @IsString()
    @IsOptional()
    @IsIn(YN_VALUES)
    isCategoriesEnabled?: 'Y' | 'N';

    @ApiProperty({
        description: 'Client field enabled flag',
        type: String,
        example: 'Y',
    })
    @IsString()
    @IsOptional()
    @IsIn(YN_VALUES)
    isClientEnabled?: 'Y' | 'N';

    @ApiProperty({
        description: 'Documents enabled flag',
        type: String,
        example: 'Y',
    })
    @IsString()
    @IsOptional()
    @IsIn(YN_VALUES)
    isDocumentsEnabled?: 'Y' | 'N';

    @ApiProperty({
        description: 'Link with products flag',
        type: String,
        example: 'Y',
    })
    @IsString()
    @IsOptional()
    @IsIn(YN_VALUES)
    isLinkWithProductsEnabled?: 'Y' | 'N';

    @ApiProperty({
        description: 'My company enabled flag',
        type: String,
        example: 'Y',
    })
    @IsString()
    @IsOptional()
    @IsIn(YN_VALUES)
    isMycompanyEnabled?: 'Y' | 'N';

    @ApiProperty({
        description: 'Observers enabled flag',
        type: String,
        example: 'Y',
    })
    @IsString()
    @IsOptional()
    @IsIn(YN_VALUES)
    isObserversEnabled?: 'Y' | 'N';

    @ApiProperty({
        description: 'Recyclebin enabled flag',
        type: String,
        example: 'Y',
    })
    @IsString()
    @IsOptional()
    @IsIn(YN_VALUES)
    isRecyclebinEnabled?: 'Y' | 'N';

    @ApiProperty({
        description: 'Set open permissions flag',
        type: String,
        example: 'Y',
    })
    @IsString()
    @IsOptional()
    @IsIn(YN_VALUES)
    isSetOpenPermissions?: 'Y' | 'N';

    @ApiProperty({
        description: 'Source enabled flag',
        type: String,
        example: 'Y',
    })
    @IsString()
    @IsOptional()
    @IsIn(YN_VALUES)
    isSourceEnabled?: 'Y' | 'N';

    @ApiProperty({
        description: 'Stages enabled flag',
        type: String,
        example: 'Y',
    })
    @IsString()
    @IsOptional()
    @IsIn(YN_VALUES)
    isStagesEnabled?: 'Y' | 'N';

    @ApiProperty({
        description: 'External smart flag',
        type: String,
        example: 'N',
    })
    @IsString()
    @IsOptional()
    @IsIn(YN_VALUES)
    isExternal?: 'Y' | 'N';

    @ApiProperty({
        description: 'Custom section id',
        type: Number,
        example: 1,
    })
    @IsNumber()
    @IsOptional()
    customSectionId?: number;

    @ApiProperty({
        description: 'Custom sections payload',
        type: [Object],
        example: [],
    })
    @IsArray()
    @IsOptional()
    customSections?: unknown[];
}

export class PbxSmartDefinitionDto {
    @ApiProperty({
        description: 'Smart code',
        type: String,
        example: 'service_offer',
    })
    @IsString()
    @IsNotEmpty()
    code: string;

    @ApiProperty({
        description: 'Smart title',
        type: String,
        example: 'Service offer',
    })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({
        description: 'Smart categories',
        type: [PbxCategoryDefinitionDto],
    })
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PbxCategoryDefinitionDto)
    categories?: PbxCategoryDefinitionDto[];

    @ApiProperty({
        description: 'Smart fields',
        type: [PbxFieldDefinitionDto],
    })
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PbxFieldDefinitionDto)
    fields?: PbxFieldDefinitionDto[];

    @ApiProperty({
        description: 'Smart install settings',
        type: PbxSmartInstallSettingsDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => PbxSmartInstallSettingsDto)
    installSettings?: PbxSmartInstallSettingsDto;
}

/**
 * RPA definition.
 */
export class PbxRpaDefinitionDto {
    @ApiProperty({
        description: 'RPA code',
        type: String,
        example: 'service_rpa',
    })
    @IsString()
    @IsNotEmpty()
    code: string;

    @ApiProperty({
        description: 'RPA title',
        type: String,
        example: 'Service RPA',
    })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({
        description: 'RPA stages',
        type: [PbxStageDefinitionDto],
    })
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PbxStageDefinitionDto)
    stages?: PbxStageDefinitionDto[];

    @ApiProperty({
        description: 'RPA fields',
        type: [PbxFieldDefinitionDto],
    })
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PbxFieldDefinitionDto)
    fields?: PbxFieldDefinitionDto[];
}

/**
 * List definition.
 */
export class PbxListDefinitionDto {
    @ApiProperty({
        description: 'List code',
        type: String,
        example: 'ork-history',
    })
    @IsString()
    @IsNotEmpty()
    code: string;

    @ApiProperty({
        description: 'List title',
        type: String,
        example: 'History',
    })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({ description: 'List type', type: String, example: 'list' })
    @IsString()
    @IsNotEmpty()
    type: string;

    @ApiProperty({
        description: 'List group',
        type: String,
        example: 'service',
    })
    @IsString()
    @IsNotEmpty()
    group: string;

    @ApiProperty({
        description: 'List is active',
        type: Boolean,
        example: true,
    })
    @IsBoolean()
    @IsNotEmpty()
    isActive: boolean;

    @ApiProperty({ description: 'List sort order', type: Number, example: 10 })
    @IsNumber()
    @IsNotEmpty()
    order: number;

    @ApiProperty({
        description: 'List needs update',
        type: Boolean,
        example: true,
    })
    @IsBoolean()
    @IsNotEmpty()
    isNeedUpdate: boolean;

    @ApiProperty({
        description: 'List fields',
        type: [PbxFieldDefinitionDto],
    })
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PbxFieldDefinitionDto)
    fields?: PbxFieldDefinitionDto[];
}

export class PbxGroupEntityFieldsDto {
    @ApiProperty({
        description: 'Entity fields',
        type: [PbxFieldDefinitionDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PbxFieldDefinitionDto)
    fields: PbxFieldDefinitionDto[];
}

export class PbxGroupEntityWithCategoriesDto extends PbxGroupEntityFieldsDto {
    @ApiProperty({
        description: 'Entity categories',
        type: [PbxCategoryDefinitionDto],
    })
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PbxCategoryDefinitionDto)
    categories?: PbxCategoryDefinitionDto[];
}

/**
 * Full entity group definition — normalized group payload.
 */
export class PbxGroupDefinitionDto {
    @ApiProperty({
        description: 'Group code',
        example: 'sales',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    group: string;

    @ApiProperty({
        description: 'Group app type',
        example: 'event',
        type: String,
    })
    @IsString()
    @IsOptional()
    appType?: string;

    @ApiProperty({
        description: 'Group fields',
        type: [PbxFieldDefinitionDto],
    })
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PbxFieldDefinitionDto)
    fields: PbxFieldDefinitionDto[];

    @ApiProperty({
        description: 'User section',
        type: PbxGroupEntityFieldsDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => PbxGroupEntityFieldsDto)
    user?: PbxGroupEntityFieldsDto;

    @ApiProperty({
        description: 'Contact section',
        type: PbxGroupEntityFieldsDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => PbxGroupEntityFieldsDto)
    contact?: PbxGroupEntityFieldsDto;

    @ApiProperty({
        description: 'Company section',
        type: PbxGroupEntityFieldsDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => PbxGroupEntityFieldsDto)
    company?: PbxGroupEntityFieldsDto;

    @ApiProperty({
        description: 'Deal section',
        type: PbxGroupEntityWithCategoriesDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => PbxGroupEntityWithCategoriesDto)
    deal?: PbxGroupEntityWithCategoriesDto;

    @ApiProperty({
        description: 'Task section',
        type: PbxGroupEntityFieldsDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => PbxGroupEntityFieldsDto)
    task?: PbxGroupEntityFieldsDto;

    @ApiProperty({
        description: 'Lead section',
        type: PbxGroupEntityWithCategoriesDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => PbxGroupEntityWithCategoriesDto)
    lead?: PbxGroupEntityWithCategoriesDto;

    @ApiProperty({
        description: 'Group smarts',
        type: [PbxSmartDefinitionDto],
    })
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PbxSmartDefinitionDto)
    smarts?: PbxSmartDefinitionDto[];

    @ApiProperty({
        description: 'Group rpas',
        type: [PbxRpaDefinitionDto],
    })
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PbxRpaDefinitionDto)
    rpas?: PbxRpaDefinitionDto[];

    @ApiProperty({
        description: 'Group lists',
        type: [PbxListDefinitionDto],
    })
    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => PbxListDefinitionDto)
    lists?: PbxListDefinitionDto[];
}
