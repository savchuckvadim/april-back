export interface IUserFieldConfig {
    id?: string | number;
    /**
     * Владелец поля, напр. `CRM_LEAD`, `CRM_DEAL`, для смартов — `CRM_{id}`.
     *
     * ⚠️ Для смарт-процессов `{id}` — это **id из `crm.type.list`**
     * (маленький, напр. 7; в PortalDB — `smarts.bitrixId`), а НЕ
     * `entityTypeId` (напр. 177)! На `CRM_{entityTypeId}` Bitrix отвечает
     * «Вы не можете просматривать настройки пользовательских полей» — той же
     * фразой, что при нехватке прав администратора CRM (боевой инцидент
     * 2026-07-21). Пример из доки: id=7, entityTypeId=177 → `CRM_7`.
     */
    entityId: string;
    /**
     * Имя поля `UF_CRM_...`; для смартов — `UF_CRM_{id из crm.type.list}_{CODE}`
     * (id — НЕ entityTypeId, см. {@link entityId}).
     */
    fieldName: string;
    userTypeId: EUserFieldType;
    xmlId: string | null;
    sort?: string | number;
    multiple: 'Y' | 'N';
    mandatory: 'Y' | 'N';
    showFilter: 'E' | 'Y' | 'N';
    showInList: 'Y' | 'N';
    editInList?: 'Y' | 'N';
    isSearchable: 'Y' | 'N';
    settings?: {
        SIZE?: number;
        LIST_WIDTH?: number;
        LIST_HEIGHT?: number;
        MAX_SHOW_SIZE?: number;
        MAX_ALLOWED_SIZE?: number;
        EXTENSIONS?: string[];
        /**
         * Для userTypeId='crm' — привязка поля к сущностям: ключи
         * LEAD/DEAL/CONTACT/COMPANY со значением 'Y'/'N'. Без них crm-поле
         * создаётся без привязок и значения ['D_123'] не сохраняются.
         */
        [entity: string]: unknown;
    };
    languageId?: UFConfigLangMap;
    editFormLabel?: UFConfigLangMap;
    listColumnLabel?: UFConfigLangMap;
    listFilterLabel?: UFConfigLangMap;
    errorMessage?: UFConfigLangMapNullable;
    helpMessage?: UFConfigLangMapNullable;
    enum?: IUserFieldConfigEnumerationItem[];
}
export interface IUserFieldConfigSmart<T extends string>
    extends IUserFieldConfig {
    /** `CRM_{id из crm.type.list}` — НЕ entityTypeId (см. IUserFieldConfig.entityId). */
    entityId: `CRM_${T}`;
}

export interface UFConfigLangMap {
    [lang: string]: string;
}
export interface UFConfigLangMapNullable {
    [lang: string]: string | null;
}
export enum EUserFieldType {
    CRM = 'crm',
    CRM_STATUS = 'crm_status',
    EMPLOYEE = 'employee',
    MONEY = 'money',
    STRING = 'string',
    INTEGER = 'integer',
    DOUBLE = 'double',
    DATETIME = 'datetime',
    DATE = 'date',
    BOOLEAN = 'boolean',
    ADDRESS = 'address',
    URL = 'url',
    FILE = 'file',
    ENUMERATION = 'enumeration',
    IBLOCK_SECTION = 'iblock_section',
    IBLOCK_ELEMENT = 'iblock_element',
}

export interface IUserFieldConfigEnumerationItem {
    id?: string | number;
    userFieldId?: string | number;
    value: string;
    def: 'Y' | 'N';
    sort: string | number;
    xmlId: string;
    /**
     * Флаг удаления элемента списка при `userfieldconfig.update`.
     * Совпадает с поведением legacy `crm.{entity}.userfield.update({ LIST: [{ ID, DEL: 'Y' }] })`.
     */
    del?: 'Y' | 'N';
}
export interface IUserFieldConfigSmart<T extends string>
    extends IUserFieldConfig {
    /** `CRM_{id из crm.type.list}` — НЕ entityTypeId (см. IUserFieldConfig.entityId). */
    entityId: `CRM_${T}`;
}
