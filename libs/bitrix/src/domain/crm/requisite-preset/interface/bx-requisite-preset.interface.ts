/**
 * Пресет реквизита Bitrix24 (шаблон карточки реквизита).
 * Возвращается методами `crm.requisite.preset.*`.
 */
export interface IBXRequisitePreset {
    [key: string]: string | number | boolean | undefined;
    ID: number;
    ENTITY_TYPE_ID: number;
    COUNTRY_ID: number;
    NAME: string;
    /** 'Y' | 'N' */
    ACTIVE?: string;
    SORT?: number;
    XML_ID?: string;
    DATE_CREATE?: string;
    CREATED_BY_ID?: number;
}

/**
 * Страна, доступная для пресета (`crm.requisite.preset.countries`).
 */
export interface IBXRequisitePresetCountry {
    [key: string]: string | number | undefined;
    COUNTRY_ID: number;
    VALUE: string;
}
