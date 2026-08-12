/**
 * Const-описание смарт-процесса «СКАП» (статистика использования СКАП).
 *
 * Единственный источник правды о смарте: установка полей (installer),
 * запись элементов (writer) и потребители в приложениях используют ЭТОТ
 * файл. Элемент смарта = ОДНА строка выгрузки Online.csv, т.е. один
 * логин клиента за один отчётный месяц (решение 2026-08-11
 * «один элемент = один элемент»).
 *
 * Смарт без воронок и стадий; связи — parent-сделка (по датам договора),
 * parent-компания (фундамент: рег-лист), контакт по email-логину.
 * План: ai/tasks/skap-import-pipeline-plan.md.
 */

/** Типы полей повторяют PortalFieldType (mapFieldTypeToBitrixType). */
export type SkapFieldType =
    | 'string'
    | 'integer'
    | 'datetime'
    | 'boolean'
    | 'enumeration'
    | 'employee'
    | 'crm';

export interface SkapSmartEnumItem {
    /** Код значения (xmlId в Bitrix). */
    CODE: string;
    /** Отображаемое значение. */
    VALUE: string;
    SORT: number;
}

export interface SkapSmartFieldDef {
    /** Код поля: суффикс UF-имени (UF_CRM_{typeId}_{code}) и xmlId. UPPER_SNAKE. */
    code: SkapFieldCode;
    /** Русское название поля в карточке/списке. */
    name: string;
    type: SkapFieldType;
    /** Значения для enumeration-полей. */
    items?: readonly SkapSmartEnumItem[];
    isMultiple?: boolean;
    /**
     * Для type='crm' — привязка к сущностям (settings userfieldconfig).
     * БЕЗ этого Bitrix создаёт crm-поле без привязок и значения вида
     * ['D_123'] молча не сохраняются (боевой инцидент 2026-07-22).
     */
    crmEntities?: readonly ('LEAD' | 'DEAL' | 'CONTACT' | 'COMPANY')[];
}

export const SKAP_SMART_TYPE = 'skap';
/** Смарт сервисного контура (группа отдела сервиса/ОРК). */
export const SKAP_SMART_GROUP = 'service';
/**
 * Код смарта в Bitrix — по конвенции pbx-install `${type}_${group}`.
 * ВАЖНО: code — ключ идемпотентности установки; менять его можно только
 * с полной переустановкой смарта на всех порталах.
 */
export const SKAP_SMART_CODE = `${SKAP_SMART_TYPE}_${SKAP_SMART_GROUP}`;
export const SKAP_SMART_TITLE = 'СКАП';

// ---------------------------------------------------------------------------
// Поле компании с рег-листом (ID клиента в АРМ)
// ---------------------------------------------------------------------------

/**
 * UF-поле компании Bitrix с номером регистрационного листа (ID клиента в
 * АРМ, формат `61-40762-000004`). Пишется konstructor supply
 * (RPA_ARM_CLIENT_ID), объявлено в IBXCompany. Матчинг компаний при
 * импорте СКАП идёт СТРОГО по этому полю — компания-фундамент связи.
 */
export const SKAP_COMPANY_REG_FIELD = 'UF_CRM_USER_CARDNUM';

// ---------------------------------------------------------------------------
// Поле контакта с ключами СКАП-логинов
// ---------------------------------------------------------------------------

/**
 * UF-поле КОНТАКТА с ключами СКАП-логинов (множественная строка).
 * Логин СКАП — это email; один человек может работать в нескольких
 * организациях с разными корпоративными логинами, поэтому поле
 * множественное. Ключ переживает мердж контактов и смену/удаление
 * обычного EMAIL: поиск контакта при импорте идёт и по EMAIL, и по этому
 * полю. Устанавливается идемпотентно в InstallSkapSmartUseCase.
 */
export const SKAP_CONTACT_LOGINS_FIELD = 'UF_CRM_SKAP_LOGINS';
export const SKAP_CONTACT_LOGINS_XML_ID = 'SKAP_LOGINS';
export const SKAP_CONTACT_LOGINS_TITLE = 'СКАП-логины';

/**
 * UF-поле СДЕЛКИ с ID комплектов АРМ (пишется konstructor supply как
 * RPA_ARM_COMPLECT_ID, объявлено в IBXDeal). Используется при выборе
 * сделки для элемента СКАП: совпадение «ID Комплекта» строки выгрузки с
 * комплектом сделки — сильный сигнал (решатель спорных ситуаций, когда
 * один комплект живёт в разных сделках на разные периоды).
 */
export const SKAP_DEAL_COMPLECT_FIELD = 'UF_CRM_RPA_ARM_COMPLECT_ID';

// ---------------------------------------------------------------------------
// События месяца (типизация событий по логину)
// ---------------------------------------------------------------------------

/**
 * Коды событий месяца — вычисляются при записи сравнением с предыдущим
 * периодом (skap_import_items / skap_sessions). Единый источник правды для
 * enum-поля смарта и потребителей (отчёты, AI-анализ).
 */
export const SKAP_EVENT_CODES = [
    'first_client_month',
    'new_login',
    'growth',
    'drop',
    'inactive',
] as const;

export type SkapEventCode = (typeof SKAP_EVENT_CODES)[number];

export const SKAP_EVENT_ITEMS = [
    { CODE: 'first_client_month', VALUE: 'Первый месяц клиента', SORT: 100 },
    { CODE: 'new_login', VALUE: 'Новый логин', SORT: 200 },
    { CODE: 'growth', VALUE: 'Рост активности', SORT: 300 },
    { CODE: 'drop', VALUE: 'Падение активности', SORT: 400 },
    { CODE: 'inactive', VALUE: 'Неактивен (0 заходов)', SORT: 500 },
] as const satisfies readonly (SkapSmartEnumItem & {
    CODE: SkapEventCode;
})[];

/** Порог рост/падение к прошлому месяцу, % (для событий growth/drop). */
export const SKAP_EVENT_TREND_THRESHOLD_PCT = 30;

// ---------------------------------------------------------------------------
// Коды полей смарта
// ---------------------------------------------------------------------------

export const SKAP_FIELD_CODES = [
    // — Период и идентификация —
    'PERIOD',
    'PERIOD_CODE',
    'LOGIN',
    'LOGIN_CREATED',
    'CLIENT_CARD',
    'REG_LIST',
    'RP_NAME',
    'CLIENT_NAME',
    // — Комплект —
    'COMPLECT_ID',
    'COMPLECT_TYPE',
    'COMPLECT_NAME',
    'SUPPLY_KIND',
    'NET_COEF',
    // — Статистика месяца —
    'SESSION_COUNT',
    'TIME_TOTAL_MIN',
    'IP_COUNT',
    'IP_LIST',
    // — Справочная информация (Prime_lent) —
    'CITY',
    'REGION',
    'MANAGER_NAME',
    'MAILING_COUNT',
    // — Служебные —
    'SOURCE_FILE',
    'FORMAT_VERSION',
    // — Связи и события —
    'COMPANY_LINK',
    'DEAL_LINK',
    'CONTACT_LINK',
    'EVENTS',
] as const;

export type SkapFieldCode = (typeof SKAP_FIELD_CODES)[number];

/**
 * Максимум символов в поле IP_LIST: длинные значения — главный вклад в
 * row-size лимит строки b_crm_dynamic_items (~8126 байт, skill
 * bitrix-field-limits; боевой инцидент 2026-08-12 «Row size too large» на
 * crm.item.update). Полный список IP хранится в БД (skap_sessions).
 */
export const SKAP_IP_LIST_MAX_LEN = 190;

/**
 * Ступени деградации записи элемента под row-size лимит (канон
 * call-report writeWithDegradation): обрезка длины не помогает — помогает
 * уменьшение ЧИСЛА длинных полей.
 * Ступень 1 — чисто справочные поля (полные данные в БД: sessions/files).
 * Ступень 2 — плюс описательные строки (минимум для отчётов остаётся:
 * период, логин, карточки, комплект-ID, счётчики, связи, события).
 */
export const SKAP_DEGRADE_STEP1_CODES: readonly SkapFieldCode[] = [
    'IP_LIST',
    'SOURCE_FILE',
];
export const SKAP_DEGRADE_STEP2_CODES: readonly SkapFieldCode[] = [
    ...SKAP_DEGRADE_STEP1_CODES,
    'RP_NAME',
    'CLIENT_NAME',
    'COMPLECT_TYPE',
    'COMPLECT_NAME',
    'SUPPLY_KIND',
    'NET_COEF',
    'CITY',
    'REGION',
    'MANAGER_NAME',
];

// ---------------------------------------------------------------------------
// Полный список полей смарта
// ---------------------------------------------------------------------------

export const SKAP_SMART_FIELDS: SkapSmartFieldDef[] = [
    // — Период и идентификация —
    { code: 'PERIOD', name: 'Отчётный месяц', type: 'datetime' },
    { code: 'PERIOD_CODE', name: 'Период (YYYY-MM)', type: 'string' },
    { code: 'LOGIN', name: 'Логин', type: 'string' },
    { code: 'LOGIN_CREATED', name: 'Дата заведения логина', type: 'datetime' },
    {
        code: 'CLIENT_CARD',
        name: 'Номер карточки клиента (АРМ)',
        type: 'string',
    },
    { code: 'REG_LIST', name: 'Номер карточки РП', type: 'string' },
    { code: 'RP_NAME', name: 'Название РП', type: 'string' },
    {
        code: 'CLIENT_NAME',
        name: 'Название клиента (из выгрузки)',
        type: 'string',
    },

    // — Комплект —
    { code: 'COMPLECT_ID', name: 'ID комплекта АРМ', type: 'string' },
    { code: 'COMPLECT_TYPE', name: 'Тип комплекта', type: 'string' },
    { code: 'COMPLECT_NAME', name: 'Комплект', type: 'string' },
    { code: 'SUPPLY_KIND', name: 'Вид поставки', type: 'string' },
    { code: 'NET_COEF', name: 'Сетевой коэффициент', type: 'string' },

    // — Статистика месяца —
    { code: 'SESSION_COUNT', name: 'Заходов за месяц', type: 'integer' },
    { code: 'TIME_TOTAL_MIN', name: 'Времени за месяц, мин', type: 'integer' },
    { code: 'IP_COUNT', name: 'Разных IP', type: 'integer' },
    { code: 'IP_LIST', name: 'Список IP', type: 'string' },

    // — Справочная информация (Prime_lent) —
    { code: 'CITY', name: 'Город РП', type: 'string' },
    { code: 'REGION', name: 'Регион РП', type: 'string' },
    { code: 'MANAGER_NAME', name: 'Менеджер (из выгрузки)', type: 'string' },
    { code: 'MAILING_COUNT', name: 'Активных рассылок', type: 'integer' },

    // — Служебные —
    { code: 'SOURCE_FILE', name: 'Файл-источник', type: 'string' },
    { code: 'FORMAT_VERSION', name: 'Версия формата', type: 'string' },

    // — Связи и события —
    {
        code: 'COMPANY_LINK',
        name: 'Компания',
        type: 'crm',
        crmEntities: ['COMPANY'],
    },
    {
        code: 'DEAL_LINK',
        name: 'Сделка',
        type: 'crm',
        crmEntities: ['DEAL'],
    },
    {
        code: 'CONTACT_LINK',
        name: 'Контакт (по логину)',
        type: 'crm',
        crmEntities: ['CONTACT'],
    },
    {
        code: 'EVENTS',
        name: 'События месяца',
        type: 'enumeration',
        items: SKAP_EVENT_ITEMS,
        isMultiple: true,
    },
];

// ---------------------------------------------------------------------------
// Хелперы имён и кодов
// ---------------------------------------------------------------------------

/**
 * UF-имя поля для userfieldconfig: UF_CRM_{typeId}_{code}.
 * ВАЖНО: typeId — id смарт-типа из crm.type.list (НЕ entityTypeId).
 */
export function buildSkapUfName(typeId: number | string, code: string): string {
    return `UF_CRM_${typeId}_${code}`;
}

/**
 * Имя поля в crm.item.* API: camelCase от UF-имени
 * (UF_CRM_13_PERIOD_CODE → ufCrm13PeriodCode).
 * typeId — id смарт-типа из crm.type.list (НЕ entityTypeId).
 */
export function buildSkapItemFieldName(
    typeId: number | string,
    code: string,
): string {
    const pascal = code
        .toLowerCase()
        .split('_')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
    return `ufCrm${typeId}${pascal}`;
}

/** Нормализация логина для ключей идемпотентности: trim + lowercase. */
export function normalizeSkapLogin(login: string): string {
    return login.trim().toLowerCase();
}

/**
 * Уникальный внешний код элемента (xmlId в Bitrix):
 * skap_{clientCard}_{login}_{YYYY-MM}. Логин нормализуется.
 */
export function buildSkapXmlId(
    clientCard: string,
    login: string,
    periodCode: string,
): string {
    return `skap_${clientCard.trim()}_${normalizeSkapLogin(login)}_${periodCode}`;
}

/**
 * Ключ идемпотентности строки skap_import_items:
 * {domain}:{clientCard}:{login}:{YYYY-MM}.
 */
export function buildSkapItemDedupKey(
    domain: string,
    clientCard: string,
    login: string,
    periodCode: string,
): string {
    return `${domain}:${clientCard.trim()}:${normalizeSkapLogin(login)}:${periodCode}`;
}
