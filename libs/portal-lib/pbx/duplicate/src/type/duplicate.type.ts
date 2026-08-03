/**
 * Доменные типы поиска дублей CRM.
 *
 * Ключевая идея: дубль ищется не «по лиду», а по НАБОРУ СИГНАЛОВ (телефон,
 * email, ИНН, название), извлечённых из любой сущности. Поэтому поиск
 * одинаково работает из пустого лида, из компании и из сделки (через
 * привязанную компанию/контакт).
 */

/** Типы CRM, среди которых ищем дубли. */
export enum DuplicateEntityType {
    LEAD = 'LEAD',
    CONTACT = 'CONTACT',
    COMPANY = 'COMPANY',
    DEAL = 'DEAL',
}

/** entityTypeId Битрикса — нужен для crm.duplicate.volatileType.* и crm.item.*. */
export const DUPLICATE_ENTITY_TYPE_ID: Record<DuplicateEntityType, number> = {
    [DuplicateEntityType.LEAD]: 1,
    [DuplicateEntityType.DEAL]: 2,
    [DuplicateEntityType.CONTACT]: 3,
    [DuplicateEntityType.COMPANY]: 4,
};

export const DUPLICATE_ENTITY_TYPE_BY_ID: Record<number, DuplicateEntityType> =
    {
        1: DuplicateEntityType.LEAD,
        2: DuplicateEntityType.DEAL,
        3: DuplicateEntityType.CONTACT,
        4: DuplicateEntityType.COMPANY,
    };

/** Сущности, которые понимает crm.duplicate.findbycomm (сделки — нет). */
export const FIND_BY_COMM_ENTITY_TYPES: DuplicateEntityType[] = [
    DuplicateEntityType.LEAD,
    DuplicateEntityType.CONTACT,
    DuplicateEntityType.COMPANY,
];

/** Вид сигнала, по которому ищем совпадение. */
export enum DuplicateSignalKind {
    PHONE = 'phone',
    EMAIL = 'email',
    INN = 'inn',
    TITLE = 'title',
}

/**
 * Откуда мы узнали, что данное поле портала хранит ИНН.
 *
 * Порядок доверия: template > portalDb > requisite > heuristic. `manual` —
 * ручное переопределение из админки, оно сильнее всех и переживает ре-скан.
 */
export enum SignalFieldSource {
    /** Наша константа-шаблон (PBX_SALES_KONSTRUCTOR_FIELDS, код op_inn). */
    TEMPLATE = 'template',
    /** PortalDB bitrixfields: code → bitrixId → UF_CRM_{bitrixId}. */
    PORTAL_DB = 'portalDb',
    /** Штатные реквизиты Битрикса (RQ_INN). */
    REQUISITE = 'requisite',
    /** Найдено сканом живых UF-полей по названию/коду. */
    HEURISTIC = 'heuristic',
    /** Включено/выключено руками в админке. */
    MANUAL = 'manual',
}

/** Одно поле портала, пригодное как источник сигнала. */
export interface SignalFieldRef {
    entityType: DuplicateEntityType;
    kind: DuplicateSignalKind;
    /** Имя поля в Битриксе: `UF_CRM_OP_INN`, `UF_CRM_1750854801`, `RQ_INN`. */
    fieldName: string;
    /** Код поля в нашем шаблоне/PortalDB, если известен (`op_inn`). */
    code?: string;
    /** Человекочитаемое название — для админки. */
    title?: string;
    source: SignalFieldSource;
    /** Участвует ли поле в поиске. Heuristic-поля включены, но помечены. */
    enabled: boolean;
}

/** Карта полей-сигналов портала — то, что «сканим заранее и держим в кэше». */
export interface PortalSignalFieldMap {
    domain: string;
    /** ISO-время последнего скана — показываем в админке. */
    scannedAt: string;
    fields: SignalFieldRef[];
    /** Домены/поля, недоступные при скане (нет прав, сущность выключена). */
    warnings: string[];
}

/** Нормализованный набор сигналов, по которому идёт поиск. */
export interface DuplicateSignals {
    /** Последние 10 цифр номера — формат, который понимает findbycomm. */
    phones: string[];
    emails: string[];
    /** Только валидные ИНН (10/12 цифр с контрольной суммой). */
    inns: string[];
    /** Нормализованные названия/ФИО для подстрочного поиска. */
    titles: string[];
}

/** Пустой набор — удобно как аккумулятор. */
export function emptySignals(): DuplicateSignals {
    return { phones: [], emails: [], inns: [], titles: [] };
}

/** Источник, из которого сигнал был извлечён (для объяснения в UI). */
export interface DuplicateSignalOrigin {
    entityType: DuplicateEntityType;
    id: number;
    /** Поле/механизм: `PHONE`, `UF_CRM_OP_INN`, `RQ_INN`, `TITLE`. */
    via: string;
}

/** Сигналы + откуда они пришли. */
export interface ExtractedSignals extends DuplicateSignals {
    origins: DuplicateSignalOrigin[];
    /** Сущности, которые НЕ считаем дублями (сам источник и его связи). */
    excluded: { entityType: DuplicateEntityType; id: number }[];
}

/** Причина, по которой кандидат считается дублем. */
export interface DuplicateMatchReason {
    kind: DuplicateSignalKind;
    /** Совпавшее значение (телефон/ИНН/email/фрагмент названия). */
    value: string;
    /** Каким механизмом найдено: `findbycomm`, `UF_CRM_OP_INN`, `RQ_INN`, `%TITLE`. */
    via: string;
    /** Вклад в итоговый счёт. */
    weight: number;
}

/**
 * Сырое попадание до скоринга: «в такой-то сущности нашли такое-то значение
 * таким-то способом». Один и тот же контрагент даёт несколько попаданий —
 * их схлопывает скоринг.
 */
export interface DuplicateRawHit {
    entityType: DuplicateEntityType;
    id: number;
    kind: DuplicateSignalKind;
    via: string;
    value: string;
    /** Название/ФИО, если пришло вместе с попаданием (list отдаёт, findbycomm — нет). */
    title?: string;
    assignedById?: number;
}

/** Найденный кандидат-дубль. */
export interface DuplicateCandidate {
    entityType: DuplicateEntityType;
    entityTypeId: number;
    id: number;
    title?: string;
    /** Сумма весов причин, обрезанная сверху 100. */
    score: number;
    reasons: DuplicateMatchReason[];
}

/**
 * Глубина поиска. Растёт стоимость в запросах к Битриксу — поэтому уровень
 * выбирает потребитель: фрейм всегда L1, админка может позвать L2/L3.
 */
export enum DuplicateSearchLevel {
    /** findbycomm по телефону/email + точный поиск по известным ИНН-полям. */
    FAST = 1,
    /** + реквизиты RQ_INN и подстрочный поиск по названию. */
    DEEP = 2,
    /** + скан таймлайна на упоминания телефона/ИНН (фоновая задача). */
    TIMELINE = 3,
}

/** Веса причин. Точный ИНН — почти достоверный дубль, название — лишь намёк. */
export const DUPLICATE_MATCH_WEIGHTS: Record<string, number> = {
    innRequisite: 95,
    innField: 100,
    phone: 80,
    email: 70,
    innInTitle: 40,
    title: 30,
    timeline: 20,
};

/** Ниже этого счёта кандидат не показывается без явного «показать все». */
export const DUPLICATE_SCORE_THRESHOLD = 30;

/** Вход поиска: либо ссылка на сущность, либо сырые сигналы из формы. */
export interface DuplicateSearchInput {
    entityType?: DuplicateEntityType;
    entityId?: number;
    /** Сырые значения из формы админки — нормализуются так же, как из сущности. */
    raw?: {
        phones?: string[];
        emails?: string[];
        inns?: string[];
        titles?: string[];
    };
    level: DuplicateSearchLevel;
    /** Ограничить поиск конкретными типами. Пусто — все четыре. */
    targetTypes?: DuplicateEntityType[];
    /** Игнорировать кэш результата (кнопка «искать заново»). */
    force?: boolean;
}

/** Результат поиска + диагностика по нагрузке на API. */
export interface DuplicateSearchResult {
    domain: string;
    signals: DuplicateSignals;
    origins: DuplicateSignalOrigin[];
    candidates: DuplicateCandidate[];
    level: DuplicateSearchLevel;
    /** Отдан из кэша — значит запросов к Битриксу не было вовсе. */
    fromCache: boolean;
    /** Сколько команд поместили в батчи. */
    batchCommands: number;
    /**
     * Сколько HTTP-запросов реально ушло на портал. Это и есть цена поиска:
     * команд может быть два десятка, а запросов — один (батч режется по 50).
     */
    batchRequests: number;
    warnings: string[];
}
