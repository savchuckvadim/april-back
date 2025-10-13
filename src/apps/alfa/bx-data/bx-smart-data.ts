import { IBXItem } from '@/modules/bitrix';
import { EntityTypeId, StageId } from '../dto/smart-item.dto';

export const bxSmartEntityTypeId = '1036';
export const bxSmartCategoryId = '26';
export const bxSmartSmartId = 12;

export const bxSmartData = {
    name: {
        code: 'name',
        type: 'string',
        multiple: false,
        name: 'Название',
        bitrixId: 'UF_CRM_12_NAME',
        bitrixCamelId: 'ufCrm12Name',
    },
};
export interface IBXSmartItem<
    T extends number,
    C extends number,
    S extends string,
> extends IBXItem {
    id?: number;
    xmlId: string;
    title: string;
    createdBy: number;
    updatedBy: number;
    stageId: `DT${T}_${C}:${S}`;
}
export interface IAlfaParticipantSmartItem<
    T extends EntityTypeId.PARTICIPANT,
    C extends 26,
    S extends StageId,
> extends IBXSmartItem<T, C, S> {
    id?: number;
    xmlId: string;
    title: string;
    createdBy: number;
    updatedBy: number;
    movedBy: number;
    createdTime: string;
    updatedTime: string;
    movedTime: string;
    categoryId: C;
    opened: string;
    stageId: `DT${T}_${C}:${S}`;
    previousStageId: string;
    begindate: string;
    closedate: string;
    companyId: number;
    contactId: number;
    opportunity: number;
    isManualOpportunity: string;
    taxValue: number;
    currencyId: string;
    mycompanyId: number;
    sourceId?: string;
    sourceDescription?: string;
    webformId?: number;
    ufCrm12AccountantGos?: string[];
    ufCrm12AccountantMedical?: string[];
    ufCrm12Zakupki?: string[];
    ufCrm12Kadry?: string[];
    ufCrm12Days: string[];
    ufCrm12Format: string[];
    ufCrm12AddressForUdost: string;
    ufCrm12Phone: string;
    ufCrm12Email: string;
    ufCrm12Comment: string;
    ufCrm12IsPpk: string;
    ufCrm12Name: string;
    assignedById: number;
    lastActivityBy: number;
    lastActivityTime: string;
    lastCommunicationTime: string;
    lastCommunicationCallTime: string;
    lastCommunicationEmailTime: string;
    lastCommunicationImolTime: string;
    lastCommunicationWebformTime: string;
    parentId2: number; //dealId
    parentId3: number; //companyId
    parentId4: number; //contactId
    utmSource: string;
    utmMedium: string;
    utmCampaign: string;
    utmContent: string;
    utmTerm: string;
    observers: number[];
    contactIds: number[];
    entityTypeId: number;
}
