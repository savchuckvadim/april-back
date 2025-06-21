import { EUserFieldType } from "@/modules/bitrix";

export interface Smart {
    id: string;
    title: string;
    name: string;
    entityTypeId: string;
    code: string;
    type: string;
    group: string;
    bitrixId: string;
    forStageId: string;
    forFilterId: string;
    crmId: string;
    forStage: string;
    forFilter: string;
    crm: string;
    isActive: boolean;
    isNeedUpdate: boolean;
    order: number;
    categories: Category[];
    fields: Field[];
}

export interface Stage {
    id: string;
    entityTypeId: string;
    entityType: string;
    parentType: string;
    type: string;
    group: string;
    name: string;
    title: string;
    bitrixId: string;
    isActive: boolean;
    smartBitrixId: string;
    color: string;
    code: string;
    isNeedUpdate: boolean;
    order: number;
    bitrixEnitiyId: string;
}

export interface Category {
    id: string;
    entityTypeId: string;
    entityType: string;
    type: string;
    group: string;
    name: string;
    title: string;
    bitrixId: string;
    bitrixCamelId: string;
    code: string;
    isActive: boolean;
    isNeedUpdate: boolean;
    order: number;
    isDefault: boolean;
    stages: Stage[];

}




export interface ListItem {
    VALUE: string;
    DEL: string;
    XML_ID: string;
    CODE: string;
    SORT: number;
}

export interface Field {
    name: string;
    appType: string;
    type: EUserFieldType;
    list: ListItem[];
    code: string;
    smart: string;
    order: number;
    isNeedUpdate: boolean;
    isMultiple: boolean;
}
