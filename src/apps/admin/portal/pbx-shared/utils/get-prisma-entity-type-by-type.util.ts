import {
    PbxEntityType,
    PbxEntityTypePrisma,
} from '../type/pbx-entity-type.enum';

export const getPrismaEntityTypeByType = (
    type: PbxEntityType,
): PbxEntityTypePrisma => {
    switch (type) {
        case PbxEntityType.SMART:
            return PbxEntityTypePrisma.SMART;
        case PbxEntityType.BTX_COMPANY:
            return PbxEntityTypePrisma.BTX_COMPANY;
        case PbxEntityType.BTX_CONTACT:
            return PbxEntityTypePrisma.BTX_CONTACT;
        case PbxEntityType.LEAD:
            return PbxEntityTypePrisma.LEAD;
        case PbxEntityType.DEAL:
            return PbxEntityTypePrisma.DEAL;
        case PbxEntityType.BTX_RPA:
            return PbxEntityTypePrisma.BTX_RPA;
        case PbxEntityType.BX_RQ:
            return PbxEntityTypePrisma.BX_RQ;
        case PbxEntityType.BITRIX_LIST:
            return PbxEntityTypePrisma.BITRIX_LIST;
        case PbxEntityType.USER:
            return PbxEntityTypePrisma.USER;
    }
};
