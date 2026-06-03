import { Field } from '@/modules/pbx-install/shared/parse-field-excel/type/parse-field.type';

export interface List {
    id: string;
    name: string;
    code: string; //type_group
    type: string;
    group: string;
    isActive: boolean;
    order: number;
    fields: Field[];
}

export enum ListGroupEnum {
    SALES = 'sales',
    SERVICE = 'service',
    GENERAL = 'general',
}

export enum ListFolderEnum {
    HISTORY_KPI = 'history-kpi',
    PRESENTATION = 'presentation',
}

export enum ListNameEnum {
    KPI = 'kpi',
    HISTORY = 'history',
    PRESENTATION = 'presentation',
}
