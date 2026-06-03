/**
 * Canonical entity_type values stored in DB (Laravel class names).
 * This is the SINGLE source of truth for entity_type values across the project.
 * Values match the legacy Laravel model class names and MUST NOT be changed.
 */
export enum PbxEntityTypePrisma {
    SMART = 'App\\Models\\Smart',
    BTX_COMPANY = 'App\\Models\\BtxCompany',
    BTX_CONTACT = 'App\\Models\\BtxContact',
    LEAD = 'App\\Models\\Lead',
    DEAL = 'App\\Models\\BtxDeal',
    BTX_RPA = 'App\\Models\\BtxRpa',
    BX_RQ = 'App\\Models\\BxRq',
    BITRIX_LIST = 'App\\Models\\BitrixList',
    USER = 'App\\Models\\BtxUser',
}

/**
 * Short API-level entity type names used in HTTP layer.
 */
export enum PbxEntityType {
    SMART = 'smart',
    BTX_COMPANY = 'company',
    BTX_CONTACT = 'contact',
    LEAD = 'lead',
    DEAL = 'deal',
    BTX_RPA = 'rpa',
    BX_RQ = 'rq',
    BITRIX_LIST = 'list',
    USER = 'user',
}

export const getPrismaEntityTypeByType = (
    type: PbxEntityType,
): PbxEntityTypePrisma => {
    const map: Record<PbxEntityType, PbxEntityTypePrisma> = {
        [PbxEntityType.SMART]: PbxEntityTypePrisma.SMART,
        [PbxEntityType.BTX_COMPANY]: PbxEntityTypePrisma.BTX_COMPANY,
        [PbxEntityType.BTX_CONTACT]: PbxEntityTypePrisma.BTX_CONTACT,
        [PbxEntityType.LEAD]: PbxEntityTypePrisma.LEAD,
        [PbxEntityType.DEAL]: PbxEntityTypePrisma.DEAL,
        [PbxEntityType.BTX_RPA]: PbxEntityTypePrisma.BTX_RPA,
        [PbxEntityType.BX_RQ]: PbxEntityTypePrisma.BX_RQ,
        [PbxEntityType.BITRIX_LIST]: PbxEntityTypePrisma.BITRIX_LIST,
        [PbxEntityType.USER]: PbxEntityTypePrisma.USER,
    };
    return map[type];
};
