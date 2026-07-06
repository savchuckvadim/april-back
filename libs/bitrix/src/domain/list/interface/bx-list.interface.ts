export interface IBXList {
    ID: string | number;
    IBLOCK_TYPE_ID: string;
    IBLOCK_CODE: string;
    CODE?: string;
    NAME: string;
    DESCRIPTION?: string;
    SORT?: number | string;
    ACTIVE?: 'Y' | 'N';
    FIELDS?: IBXListField[];
}

export interface IBXListField {
    ID: string | number;
    IBLOCK_ID: string | number;
    NAME: string;
    CODE: string;
    TYPE: string;
    SORT?: number | string;
    ACTIVE?: 'Y' | 'N';
    REQUIRED?: 'Y' | 'N';
    MULTIPLE?: 'Y' | 'N';
    LIST?: IBXListFieldItem[];
}

export interface IBXListFieldItem {
    ID: string | number;
    VALUE: string;
    SORT?: number | string;
    ACTIVE?: 'Y' | 'N';
}

/** Типы свойств универсальных списков Bitrix (lists.field.add TYPE) */
export type BxListFieldType =
    | 'S'
    | 'N'
    | 'L'
    | 'F'
    | 'G'
    | 'E'
    | 'S:Date'
    | 'S:DateTime'
    | 'S:HTML'
    | 'S:Money'
    | 'S:employee'
    | 'S:ECrm'
    | 'S:DiskFile'
    | 'E:EList';

/** Одно значение enum-свойства (TYPE = 'L') в payload lists.field.add/update */
export interface IBXListFieldListValue {
    VALUE: string;
    SORT?: number | string;
    DEF?: 'Y' | 'N';
}

/**
 * Значения enum-свойства (TYPE = 'L') в payload lists.field.add/update.
 * Ключ — id существующего значения либо `n0`, `n1`… для новых.
 * Массив трактуется Bitrix как полный набор значений поля.
 */
export type BxListFieldListPayload = Record<string, IBXListFieldListValue>;

/** Адресация списка: по символьному коду либо по id инфоблока */
export type BxListAddress =
    | { IBLOCK_CODE: string }
    | { IBLOCK_ID: string | number };

/** Код списка или адрес (строка трактуется как IBLOCK_CODE) */
export type BxListAddressInput = string | BxListAddress;

/** Payload FIELDS для lists.field.add / lists.field.update */
export interface IBXListFieldPayload {
    NAME: string;
    TYPE?: BxListFieldType;
    CODE?: string;
    SORT?: number | string;
    IS_REQUIRED?: 'Y' | 'N';
    MULTIPLE?: 'Y' | 'N';
    DEFAULT_VALUE?: string;
    LIST?: BxListFieldListPayload;
    USER_TYPE_SETTINGS?: Record<string, string | number>;
}

/** Описание поля списка в ответе lists.field.get (ключ ответа — FIELD_ID) */
export interface IBXListFieldDescription {
    ID: string;
    FIELD_ID?: string;
    IBLOCK_ID?: string | number;
    NAME: string;
    CODE?: string;
    TYPE: string;
    PROPERTY_TYPE?: string;
    USER_TYPE?: string;
    SORT?: string | number;
    IS_REQUIRED?: 'Y' | 'N';
    MULTIPLE?: 'Y' | 'N';
    DEFAULT_VALUE?: string | null;
    /** Для enum-свойств: { valueId: displayValue } */
    DISPLAY_VALUES_FORM?: Record<string, string>;
    LIST?: Record<string, string>;
    LIST_DEF?: Record<string, string>;
    SETTINGS?: Record<string, string | number>;
}

/** Ответ lists.field.get: объект, ключ — FIELD_ID (NAME, PROPERTY_123 …) */
export type BxListFieldsGetResponse = Record<string, IBXListFieldDescription>;

export enum EBxListCode {
    SALES_KPI = 'sales_kpi',
    KPI = 'kpi',
    SALES_HISTORY = 'sales_history',
    HISTORY = 'history',
    PRESENTATION = 'presentation',
    SERVICE_HISTORY = 'service_history',
}
