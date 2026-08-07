export interface IBXField {
    ID: string;
    LABEL: string;
    ENTITY_ID: string;
    FIELD_NAME: string;
    USER_TYPE_ID: EnumUserFieldType | string;
    XML_ID: string | null;
    SORT: string;
    MULTIPLE: 'Y' | 'N';
    MANDATORY: 'Y' | 'N';
    SHOW_FILTER: string;
    SHOW_IN_LIST: 'Y' | 'N';
    EDIT_IN_LIST: 'Y' | 'N';
    IS_SEARCHABLE: 'Y' | 'N';
    SETTINGS: {
        DISPLAY?: string;
        LIST_HEIGHT?: number;
        CAPTION_NO_VALUE?: string;
        SHOW_NO_VALUE?: 'Y' | 'N';
        /**
         * Привязки crm-типа (USER_TYPE_ID='crm'): какие сущности можно
         * хранить в поле. БЕЗ них значения вида `L_123` Битрикс молча
         * не сохраняет.
         */
        LEAD?: 'Y' | 'N';
        CONTACT?: 'Y' | 'N';
        COMPANY?: 'Y' | 'N';
        DEAL?: 'Y' | 'N';
        /** textarea-поля (ROWS) и прочие типоспецифичные настройки. */
        ROWS?: number;
    };
    EDIT_FORM_LABEL: BitrixLangMap;
    LIST_COLUMN_LABEL: BitrixLangMap;
    LIST_FILTER_LABEL: BitrixLangMap;
    ERROR_MESSAGE: BitrixLangMapNullable;
    HELP_MESSAGE: BitrixLangMapNullable;
    LIST?: BitrixEnumerationOption[];
}

export interface BitrixLangMap {
    [lang: string]: string;
}

export interface BitrixLangMapNullable {
    [lang: string]: string | null;
}

export interface BitrixEnumerationOption {
    ID?: string;
    XML_ID?: string;
    SORT: string;
    VALUE: string;
    DEF: 'Y' | 'N';
}

export enum EnumUserFieldType {
    STRING = 'string',
    INTEGER = 'integer',
    DOUBLE = 'double',
    DATE = 'date',
    DATETIME = 'datetime',
    BOOLEAN = 'boolean',
    FILE = 'file',
    ENUMERATION = 'enumeration',
    URL = 'url',
    ADDRESS = 'address',
    MONEY = 'money',
    IBLOCK_SECTION = 'iblock_section',
    IBLOCK_ELEMENT = 'iblock_element',
}
