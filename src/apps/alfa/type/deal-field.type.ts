

// Базовые интерфейсы для типизации
export interface DealValueListItem {
    readonly name: string;
    readonly bitrixId: string | number;
    readonly sort?: string;
}

export interface EnumerationField {
    readonly id?: string;
    readonly type: 'enumeration';
    readonly bitrixId: string;
    readonly name: string;
    readonly code?: string | null;
    readonly multiple?: boolean;
    readonly mandatory?: boolean;
    readonly list: readonly DealValueListItem[];
}

export interface SimpleField {
    readonly id?: string;
    readonly type?: string;
    readonly bitrixId: string;
    readonly name: string;
    readonly code?: string | null;
    readonly multiple?: boolean;
    readonly mandatory?: boolean;
}

export type DealField = EnumerationField | SimpleField;

export type DealFieldsTemplate = {
    readonly [key: string]: DealField | DealFieldsTemplate;
};

