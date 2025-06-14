export interface IBXList {
    ID: string | number;
    IBLOCK_TYPE_ID: string;
    IBLOCK_CODE: string;
    NAME: string;
    DESCRIPTION?: string;
    SORT?: number;
    ACTIVE?: 'Y' | 'N';
    FIELDS?: IBXListField[];
}

export interface IBXListField {
    ID: string | number;
    IBLOCK_ID: string | number;
    NAME: string;
    CODE: string;
    TYPE: string;
    SORT?: number;
    ACTIVE?: 'Y' | 'N';
    REQUIRED?: 'Y' | 'N';
    MULTIPLE?: 'Y' | 'N';
    LIST?: IBXListFieldItem[];
}

export interface IBXListFieldItem {
    ID: string | number;
    VALUE: string;
    SORT?: number;
    ACTIVE?: 'Y' | 'N';
} 

export enum EBxListCode {
    SALES_KPI = 'sales_kpi',
    KPI = 'kpi',
    SALES_HISTORY = 'sales_history',
    HISTORY = 'history',
    PRESENTATION = 'presentation',
    SERVICE_HISTORY = 'service_history'
}