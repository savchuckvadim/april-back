import { IBXLead } from "src/modules/bitrix/domain/interfaces/bitrix.interface";

export class LeadDto implements IBXLead {
    ID: number;
    TITLE: string;
    UF_CRM_LEAD_QUEST_URL: string;
    UF_CRM_LEAD_SOURCE_ID: string;
    UF_CRM_LEAD_SOURCE_DESCRIPTION: string;
    UF_CRM_LEAD_SOURCE_NAME: string;
    UF_CRM_LEAD_SOURCE_TYPE: string;
    UF_CRM_LEAD_SOURCE_TYPE_ID: string;
    [key: string]: string | number;
}
