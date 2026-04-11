import { PbxEntityType } from '@/shared/enums';

/**
 * Item (enumeration value) within a field definition.
 */
export interface PbxFieldItemDefinition {
    readonly code: string;
    readonly value: string;
    readonly sort: number;
    readonly xmlId?: string;
    readonly del?: 'Y' | 'N';
}

/**
 * Field definition — the application's source of truth for a Bitrix user field.
 *
 * - `code` is the stable application key (e.g., 'xo_name')
 * - `suffix` maps to the Bitrix field name suffix per entity
 *   For CRM entities: UF_CRM_{SUFFIX} (e.g., UF_CRM_XO_NAME)
 *   For smart processes: UF_CRM_{entityTypeId}_{SUFFIX} (e.g., UF_CRM_134_XO_NAME)
 */
export interface PbxFieldDefinition {
    readonly code: string;
    readonly name: string;
    readonly type: string;
    readonly isMultiple: boolean;
    readonly order?: number;
    readonly appType?: string;

    /**
     * Suffix per entity type. Empty string = field not installed on this entity.
     * For CRM entities, this is the FIELD_NAME suffix after UF_CRM_.
     * For smart processes, entityTypeId is prepended at install time.
     */
    readonly suffixes: Partial<Record<PbxEntityType, string>>;

    readonly items?: readonly PbxFieldItemDefinition[];
}

/**
 * Stage definition within a category.
 */
export interface PbxStageDefinition {
    readonly code: string;
    readonly name: string;
    readonly color?: string;
    readonly sort: number;
    readonly isDefault?: boolean;
    readonly semantics?: string;
}

/**
 * Category definition — a direction (воронка) within a CRM entity.
 */
export interface PbxCategoryDefinition {
    readonly code: string;
    readonly name: string;
    readonly sort: number;
    readonly entityType: PbxEntityType;
    readonly isDefault?: boolean;
    readonly stages: readonly PbxStageDefinition[];
}

/**
 * Smart Process definition. `entityTypeId` is unknown until Bitrix assigns it.
 */
export interface PbxSmartDefinition {
    readonly code: string;
    readonly title: string;

    readonly categories?: readonly PbxCategoryDefinition[];
    readonly fields?: readonly PbxFieldDefinition[];
}

/**
 * RPA definition.
 */
export interface PbxRpaDefinition {
    readonly code: string;
    readonly title: string;

    readonly stages?: readonly PbxStageDefinition[];
    readonly fields?: readonly PbxFieldDefinition[];
}

/**
 * Full entity group definition — all fields, categories, stages for a group (e.g., "sales").
 */
export interface PbxGroupDefinition {
    readonly group: string;
    readonly appType?: string;

    readonly fields: readonly PbxFieldDefinition[];
    readonly categories: readonly PbxCategoryDefinition[];
    readonly smarts?: readonly PbxSmartDefinition[];
    readonly rpas?: readonly PbxRpaDefinition[];
}
