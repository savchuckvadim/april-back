import { ERqPresetCode } from '@lib/portal-lib/pbx-domain';

/**
 * Эталон одного пресета реквизита (что должно стоять в Bitrix + в `bx_rqs`).
 */
export interface RqPresetTemplate {
    /** Бизнес-код (preset_org/preset_ip/preset_fiz) — ключ для upsert в `bx_rqs`. */
    code: ERqPresetCode;
    /** Человекочитаемое имя пресета. */
    name: string;
    /** Технический разрез (org/ip/fiz). */
    type: string;
    /** Стабильный XML_ID в Bitrix — по нему ищем существующий пресет при install. */
    xmlId: string;
    /** ENTITY_TYPE_ID пресета реквизита (CRM_REQUISITE = 8). */
    entityTypeId: number;
    /** COUNTRY_ID (Россия = 1). */
    countryId: number;
    /** Дефолтный bitrix_id (fallback, реальный приходит после install). */
    defaultBitrixId: number;
    /** Порядок сортировки. */
    sort: number;
}

/**
 * Эталон одного кастомного пользовательского поля реквизита
 * (`crm.requisite.userfield.*`). FIELD_NAME (UF_CRM_*) генерит Bitrix,
 * сопоставление при повторной установке — по XML_ID.
 */
export interface RqFieldTemplate {
    /** Стабильный XML_ID — ключ сопоставления при install. */
    xmlId: string;
    /** EDIT_FORM_LABEL / LIST_COLUMN_LABEL. */
    label: string;
    /** USER_TYPE_ID Bitrix (string/enumeration/…). */
    userTypeId: string;
    /** Множественное поле. */
    isMultiple?: boolean;
    /** Ставить только поля с флагом true. */
    isNeedUpdate: boolean;
}
