import { PbxEntityType } from '@/shared/enums';
import {
    PbxFieldDefinition,
    PbxCategoryDefinition,
    PbxStageDefinition,
    PbxSmartDefinition,
} from './pbx-definition.interface';

/**
 * Resolved field record — after installation, contains the actual Bitrix IDs per portal.
 */
export interface PbxResolvedField {
    code: string;
    definition: PbxFieldDefinition;
    dbId: bigint;
    bitrixId: string;
    bitrixCamelId: string;
    entityType: PbxEntityType;
}

/**
 * Resolved category — contains the Bitrix category ID assigned to a portal.
 */
export interface PbxResolvedCategory {
    code: string;
    definition: PbxCategoryDefinition;
    dbId: bigint;
    bitrixId: number;
}

/**
 * Resolved stage — contains the Bitrix status ID assigned to a portal.
 */
export interface PbxResolvedStage {
    code: string;
    definition: PbxStageDefinition;
    dbId: bigint;
    bitrixId: string;
}

/**
 * Resolved smart process — contains the entityTypeId assigned by Bitrix.
 */
export interface PbxResolvedSmart {
    code: string;
    definition: PbxSmartDefinition;
    dbId: bigint;
    entityTypeId: number;
}

/**
 * Query options for the registry.
 */
export interface PbxRegistryQuery {
    group?: string;
    appType?: string;
    entityType?: PbxEntityType;
}
