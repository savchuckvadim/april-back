/**
 * МОДЕЛЬ ИНН СДЕЛКИ: наблюдения → пул фактов → решение.
 *
 * Постановка — `ai/tasks/2026-09-17-inn-strategy.md`. Три слоя, которые
 * нельзя путать:
 *
 * | Слой | Что это | Где лежит |
 * | --- | --- | --- |
 * | наблюдения | всё, что мы где-либо нашли | собираются при каждом касании |
 * | пул фактов | валидные кандидаты, накопительно | `op_inn_pool` сделки |
 * | решение | текущий ИНН договора | `op_inn` сделки |
 *
 * Пул только пополняется. Решение принимает человек; автоматика ставит его
 * сама только когда кандидат ровно один и он не «слабый».
 */

/** Откуда пришло значение ИНН. Порядок = убывание доверия. */
export const INN_SOURCE_KINDS = {
    /** `RQ_INN` реквизита компании — самый надёжный источник. */
    company_requisite: 'company_requisite',
    /** `RQ_INN` реквизита контакта (для ИП — основной путь). */
    contact_requisite: 'contact_requisite',
    /** Значение добавил человек руками. */
    manual: 'manual',
    /** `op_inn` сделки — текущее решение. */
    deal_field: 'deal_field',
    /** `op_inn_pool` сделки — накопленные ранее варианты. */
    deal_pool: 'deal_pool',
    /** Поля ИНН карточки компании. */
    company_field: 'company_field',
    /** Поля ИНН заявки (лида). */
    lead_field: 'lead_field',
    /** Вытащено из названия сущности — «слабое», проверять человеку. */
    title: 'title',
} as const;

export type InnSourceKind =
    (typeof INN_SOURCE_KINDS)[keyof typeof INN_SOURCE_KINDS];

export const INN_SOURCE_KIND_VALUES = Object.values(
    INN_SOURCE_KINDS,
) as readonly InnSourceKind[];

/** Сила кандидата: чем сильнее, тем больше прав у автоподстановки. */
export const INN_STRENGTHS = {
    /** Реквизит или выбор человека. */
    strong: 'strong',
    /** Поле карточки — данные достоверные, но чьи именно, не доказано. */
    normal: 'normal',
    /** Только из названия: в автоподстановке НЕ участвует. */
    weak: 'weak',
} as const;

export type InnStrength = (typeof INN_STRENGTHS)[keyof typeof INN_STRENGTHS];

export const INN_STRENGTH_VALUES = Object.values(
    INN_STRENGTHS,
) as readonly InnStrength[];

/** Происхождение текущего ИНН сделки. */
export const INN_ORIGINS = {
    /** Зеркало привязанного реквизита — ведущий источник. */
    requisite: 'requisite',
    /** Выбрал человек (есть запись в таймлайне). */
    manual: 'manual',
    /** Поставила автоматика (есть запись в таймлайне). */
    auto: 'auto',
    /** Записи о выборе нет: значение досталось от ночного догона. */
    unknown: 'unknown',
    /** ИНН не выбран. */
    none: 'none',
} as const;

export type InnOrigin = (typeof INN_ORIGINS)[keyof typeof INN_ORIGINS];

export const INN_ORIGIN_VALUES = Object.values(
    INN_ORIGINS,
) as readonly InnOrigin[];

/** Что случилось с ИНН сделки — пишется в таймлайн, оттуда же читается. */
export const INN_AUDIT_ACTIONS = {
    choose: 'choose',
    auto: 'auto',
    hide: 'hide',
    restore: 'restore',
} as const;

export type InnAuditAction =
    (typeof INN_AUDIT_ACTIONS)[keyof typeof INN_AUDIT_ACTIONS];

/** Конфликты, которые фронт показывает плашками. */
export const INN_CONFLICT_KINDS = {
    /** ИНН не выбран, а кандидаты есть. */
    not_chosen: 'not_chosen',
    /** ИНН договора не совпадает с ИНН привязанного реквизита. */
    requisite_mismatch: 'requisite_mismatch',
    /** ИНН есть, а реквизита с ним нет — печатная форма будет неполной. */
    inn_without_requisite: 'inn_without_requisite',
    /** Тот же ИНН найден в реквизите другой компании портала. */
    inn_other_company: 'inn_other_company',
    /** Привязан реквизит чужой компании. */
    requisite_foreign: 'requisite_foreign',
    /** Поля `op_inn` / `op_inn_pool` на портале не установлены. */
    fields_missing: 'fields_missing',
    /** У интеграции нет прав на реквизиты. */
    requisites_denied: 'requisites_denied',
} as const;

export type InnConflictKind =
    (typeof INN_CONFLICT_KINDS)[keyof typeof INN_CONFLICT_KINDS];

export const INN_CONFLICT_KIND_VALUES = Object.values(
    INN_CONFLICT_KINDS,
) as readonly InnConflictKind[];

export const INN_CONFLICT_LEVELS = {
    info: 'info',
    warning: 'warning',
    error: 'error',
} as const;

export type InnConflictLevel =
    (typeof INN_CONFLICT_LEVELS)[keyof typeof INN_CONFLICT_LEVELS];

export const INN_CONFLICT_LEVEL_VALUES = Object.values(
    INN_CONFLICT_LEVELS,
) as readonly InnConflictLevel[];

/** ENTITY_TYPE_ID Битрикса: реквизиты бывают ТОЛЬКО у контакта и компании. */
export const INN_RQ_ENTITY = { contact: 3, company: 4 } as const;

/** ENTITY_TYPE_ID сделки — для `crm.requisite.link.*`. */
export const INN_DEAL_ENTITY_TYPE_ID = 2;

/** Одно наблюдение: значение + место, где оно найдено. */
export interface IInnObservation {
    /** Нормализованный ИНН (10 или 12 цифр, контрольная сумма пройдена). */
    inn: string;
    kind: InnSourceKind;
    /** Id сущности-источника (лид, компания, контакт, реквизит). */
    entityId?: number;
    /** Название источника для человеческой подписи. */
    entityTitle?: string;
    /** Кто добавил (для `manual`). */
    userName?: string;
    /** Когда добавили (ISO, для `manual`). */
    at?: string;
}

/** Источник кандидата в том виде, в каком его показывает фронт. */
export interface IInnCandidateSource {
    kind: InnSourceKind;
    /** Человеческая подпись: «из реквизита компании «Ромашка»». */
    label: string;
    entityId?: number;
}

/** Кандидат пула: значение + все его источники + вердикт по силе. */
export interface IInnCandidate {
    inn: string;
    /** Разрядность: 10 — юрлицо, 12 — ИП/физлицо. */
    digits: number;
    strength: InnStrength;
    /** Главная подпись — источник с наибольшим доверием. */
    label: string;
    sources: IInnCandidateSource[];
    /** Уже лежит в `op_inn_pool` сделки. */
    inPool: boolean;
    /** Текущий ИНН договора. */
    isCurrent: boolean;
    /** Скрыт человеком («это не наш ИНН»). */
    hidden: boolean;
}

/** Карточка реквизита клиента. */
export interface IInnRequisiteCard {
    id: number;
    /** `company` | `contact` — других владельцев реквизитов не бывает. */
    ownerType: 'company' | 'contact';
    ownerId: number;
    ownerTitle: string;
    name: string;
    presetId: number;
    presetName: string;
    inn: string;
    kpp: string;
    companyName: string;
    /** Реквизит привязан к этой сделке (`crm.requisite.link`). */
    linked: boolean;
    /** Сделки, у которых этот же реквизит уже привязан. */
    otherDealIds: number[];
}

export interface IInnConflict {
    kind: InnConflictKind;
    level: InnConflictLevel;
    /** Готовый текст плашки на русском. */
    message: string;
    inn?: string;
    /** Сущности, к которым относится конфликт (компании, сделки). */
    entityIds?: number[];
}

/** Текущий ИНН договора и его происхождение. */
export interface IInnCurrent {
    inn: string;
    digits: number;
    origin: InnOrigin;
    /** Кто выбрал — для `manual`. */
    userName?: string;
    /** Когда выбрали (ISO). */
    at?: string;
    /** Id привязанного реквизита, если текущий ИНН — его зеркало. */
    requisiteId?: number;
    /**
     * Значение проставлено ночным догоном при нескольких кандидатах —
     * «догадка», которую человек должен подтвердить (раздел 5 постановки).
     */
    unverified: boolean;
}

/** Что на портале доступно — чтобы фронт не показывал пустой экран. */
export interface IInnAvailability {
    dealInnField: boolean;
    dealPoolField: boolean;
    companyInnField: boolean;
    companyPoolField: boolean;
    /** Реквизиты читаются (у интеграции есть права). */
    requisitesReadable: boolean;
}

/** Событие аудита из таймлайна сделки. */
export interface IInnAuditEvent {
    action: InnAuditAction;
    inn: string;
    userId: number | null;
    userName: string;
    /** ISO-дата комментария таймлайна. */
    at: string;
}

/** Полный снимок ИНН сделки — контракт фронта. */
export interface IInnSnapshot {
    dealId: number;
    domain: string;
    /** Сделка закрыта — только чтение. */
    readOnly: boolean;
    /** Хеш значимых значений: защита от гонки на ручке выбора. */
    version: string;
    current: IInnCurrent | null;
    candidates: IInnCandidate[];
    requisites: IInnRequisiteCard[];
    conflicts: IInnConflict[];
    availability: IInnAvailability;
    /** Что не удалось сделать при записи — показывается как есть. */
    warnings: string[];
}
