import { Field } from '@app/pbx-install/shared/parse-field-excel/type/parse-field.type';

export interface List {
    id: string;
    /** Человекочитаемое название (NAME в Bitrix, name/title в БД) */
    name: string;
    /** IBLOCK_CODE из шаблона (kpi, history, service_history, presentation) */
    code: string;
    type: string;
    group: string;
    order: number;
    fields: Field[];
}

export enum ListGroupEnum {
    SALES = 'sales',
    SERVICE = 'service',
    GENERAL = 'general',
}

/** Папка шаблона: `install/<group>/list/<folder>/data.xlsx` */
export enum ListFolderEnum {
    KPI = 'kpi',
    HISTORY = 'history',
    PRESENTATION = 'presentation',
}
