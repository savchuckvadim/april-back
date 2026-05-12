import { Field } from '@/modules/install/shared/parse-field-excel/type/parse-field.type';

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
    isDefault: 'Y' | 'N';
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
