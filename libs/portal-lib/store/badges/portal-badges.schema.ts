/**
 * РЕЕСТР портального каталога бейджиков — единственный источник правды для
 * валидации на сохранении, `GET /schema` админки и фрейма.
 *
 * Бейджик — готовая формулировка, которую менеджер ставит в поле одним
 * нажатием: в комментарий отчёта («Просил перезвонить позже») или в
 * название планируемого события («Звонок», «Выслать КП»). Решение владельца
 * 27.10.2026: требование «напиши комментарий» не создаёт смысл, а создаёт
 * «0», «ндз», «asdf» — поэтому не усиливаем валидацию, а убираем причину
 * печатать мусор.
 *
 * Реестр не шире движка фрейма: значение появляется здесь, только когда
 * фрейм исполняет его сегодня. Коды итогов работы и типов событий — ровно
 * те, что живут во фрейме «Звонки» (`WorkStatusCode`, `EV_PLAN_CODE`).
 */

/** Версия формы каталога, которую отдаёт бэк; фрейм сверяет её первой. */
export const BADGE_CATALOG_CONTRACT = 1;

/** Куда вставляется текст бейджика. */
export enum EnumBadgeTarget {
    /** Комментарий отчёта. */
    comment = 'comment',
    /** Название планируемого события. */
    title = 'title',
}
export const BADGE_TARGETS = Object.values(EnumBadgeTarget);

/** Откуда портал берёт набор: общий из кода или свой из админки. */
export enum EnumBadgeMode {
    /** Общий набор по умолчанию — один для всех порталов. */
    default = 'default',
    /** Свой набор портала: редактируется в админке. */
    own = 'own',
}
export const BADGE_MODES = Object.values(EnumBadgeMode);

/**
 * Итог работы, при котором показывается бейджик комментария.
 *
 * Пять кодов — статус работы фрейма (`WorkStatusCode`); `presentationDone`
 * — не статус, а факт «презентация проведена» (плановая или спонтанная):
 * набор «Провёл, думают» нужен при любом статусе, но только после
 * презентации. Пустой список привязок = показывать всегда.
 */
export enum EnumBadgeOutcome {
    inJob = 'inJob',
    setAside = 'setAside',
    success = 'success',
    fail = 'fail',
    notCa = 'notCa',
    presentationDone = 'presentationDone',
}
export const BADGE_OUTCOMES = Object.values(EnumBadgeOutcome);

/**
 * Тип планируемого события, к которому привязан бейджик названия — коды
 * справочника планов фрейма (`EV_PLAN_CODE`), не реестра типов событий:
 * название пишут при планировании, а там холодные виды сведены в `cold`.
 */
export enum EnumBadgePlanType {
    cold = 'cold',
    warm = 'warm',
    presentation = 'presentation',
    refine = 'refine',
    hot = 'hot',
    moneyAwait = 'moneyAwait',
    supply = 'supply',
}
export const BADGE_PLAN_TYPES = Object.values(EnumBadgePlanType);

/**
 * Цвет бейджика — тон дизайн-системы April (`StatusTone` в april-ui).
 * Только статусные тоны: цвета типов событий заняты раскраской колонок,
 * и бейджик того же цвета читался бы как ещё одно событие.
 */
export enum EnumBadgeTone {
    neutral = 'neutral',
    muted = 'muted',
    primary = 'primary',
    accent = 'accent',
    success = 'success',
    warning = 'warning',
    destructive = 'destructive',
    info = 'info',
}
export const BADGE_TONES = Object.values(EnumBadgeTone);

/** Предел длины текста бейджика: он должен читаться одним взглядом. */
export const BADGE_TEXT_MAX_LENGTH = 120;
/** Предел длины кода бейджика. */
export const BADGE_CODE_MAX_LENGTH = 64;
/** Предел размера своего набора портала. */
export const BADGE_ITEMS_MAX = 200;
/** Ключ документа в JSON-колонке `portal_app_settings.settings` (event-sales). */
export const BADGES_SETTINGS_KEY = 'comment_badges';

/** Подпись и пояснение кода реестра — для админки. */
export interface BadgeRegistryOption<Code extends string = string> {
    code: Code;
    name: string;
    description: string;
}

export const BADGE_TARGET_OPTIONS: readonly BadgeRegistryOption<EnumBadgeTarget>[] =
    [
        {
            code: EnumBadgeTarget.comment,
            name: 'Комментарий',
            description:
                'Показывается под полем комментария отчёта, по нажатию ' +
                'текст встаёт в поле.',
        },
        {
            code: EnumBadgeTarget.title,
            name: 'Название события',
            description:
                'Название планируемого события. При выборе типа фрейм сам ' +
                'ставит имя клиента (слово типа добавит заголовок задачи — ' +
                'писать его не нужно); бейджики — уточнения по маленькой ' +
                'кнопке. Основной текст типа необязателен: с ним подставится ' +
                '«<текст> — <клиент>».',
        },
    ];

export const BADGE_MODE_OPTIONS: readonly BadgeRegistryOption<EnumBadgeMode>[] =
    [
        {
            code: EnumBadgeMode.default,
            name: 'Общие по умолчанию',
            description:
                'Набор из кода, общий для всех порталов. Правки в своём ' +
                'наборе не применяются, пока режим не переключён.',
        },
        {
            code: EnumBadgeMode.own,
            name: 'Свои',
            description:
                'Набор этого портала. Начать удобно с копии общего и ' +
                'поправить под свои формулировки.',
        },
    ];

export const BADGE_OUTCOME_OPTIONS: readonly BadgeRegistryOption<EnumBadgeOutcome>[] =
    [
        {
            code: EnumBadgeOutcome.inJob,
            name: 'В работе',
            description:
                'Разговор состоялся, работа продолжается: договорённости, ' +
                '«не дошёл до нужного человека».',
        },
        {
            code: EnumBadgeOutcome.setAside,
            name: 'Отложено',
            description: 'Клиент просил вернуться позже.',
        },
        {
            code: EnumBadgeOutcome.success,
            name: 'Продажа',
            description: 'Договорились о покупке.',
        },
        {
            code: EnumBadgeOutcome.fail,
            name: 'Отказ',
            description: 'Клиент отказался.',
        },
        {
            code: EnumBadgeOutcome.notCa,
            name: 'Не ЦА',
            description: 'Клиент не целевой: нет потребности, закрывается.',
        },
        {
            code: EnumBadgeOutcome.presentationDone,
            name: 'Презентация проведена',
            description:
                'Любой статус, но после проведённой презентации — ' +
                'плановой или спонтанной.',
        },
    ];

export const BADGE_PLAN_TYPE_OPTIONS: readonly BadgeRegistryOption<EnumBadgePlanType>[] =
    [
        {
            code: EnumBadgePlanType.cold,
            name: 'Холодный звонок',
            description: 'Первый контакт: пройти секретаря, выйти на ЛПР.',
        },
        {
            code: EnumBadgePlanType.warm,
            name: 'Звонок',
            description: 'Предварительные договорённости и текущая работа.',
        },
        {
            code: EnumBadgePlanType.presentation,
            name: 'Презентация',
            description: 'Показ системы, отдельная сделка-спутник.',
        },
        {
            code: EnumBadgePlanType.refine,
            name: 'Доработка',
            description: 'Закрыть открытые вопросы до решения.',
        },
        {
            code: EnumBadgePlanType.hot,
            name: 'Решение',
            description: 'Клиент думает — решающий момент.',
        },
        {
            code: EnumBadgePlanType.moneyAwait,
            name: 'Оплата',
            description: 'Ждём оплату по счёту.',
        },
        {
            code: EnumBadgePlanType.supply,
            name: 'Поставка',
            description: 'Поставка и установка.',
        },
    ];

export const BADGE_TONE_OPTIONS: readonly BadgeRegistryOption<EnumBadgeTone>[] =
    [
        {
            code: EnumBadgeTone.neutral,
            name: 'Обычный',
            description: 'Без цвета.',
        },
        {
            code: EnumBadgeTone.muted,
            name: 'Приглушённый',
            description: 'Второстепенное: «Не ЦА», мелкие уточнения.',
        },
        {
            code: EnumBadgeTone.primary,
            name: 'Основной',
            description: 'Акцент бренда.',
        },
        {
            code: EnumBadgeTone.accent,
            name: 'Акцент',
            description: 'Выделить среди соседей.',
        },
        {
            code: EnumBadgeTone.success,
            name: 'Успех',
            description: 'Договорённости и продажа.',
        },
        {
            code: EnumBadgeTone.warning,
            name: 'Внимание',
            description: 'Отложено, нужно вернуться.',
        },
        {
            code: EnumBadgeTone.destructive,
            name: 'Отказ',
            description: 'Исход «отказ».',
        },
        {
            code: EnumBadgeTone.info,
            name: 'Информация',
            description: 'Нейтральные факты разговора.',
        },
    ];

/**
 * Бейджик как он лежит в документе портала и как уезжает во фрейм —
 * форма одна, различается только отсев неактивных при компиляции.
 */
export interface BadgeRecord {
    /** Стабильный код: по нему бейджик опознаётся при сохранении. */
    code: string;
    /** Текст, который встаёт в поле. */
    text: string;
    target: EnumBadgeTarget;
    tone: EnumBadgeTone;
    /** Комментарий: при каких итогах работы показывать; пусто — всегда. */
    outcomes: EnumBadgeOutcome[];
    /** Название: для каких типов события; пусто — для всех. */
    planTypes: EnumBadgePlanType[];
    /**
     * Название: основной текст типа — подставляется сам при выборе типа
     * (фрейм дописывает имя клиента). У комментария смысла не имеет.
     */
    isDefault: boolean;
    sort: number;
    isActive: boolean;
}

/** Документ каталога портала — то, что лежит в JSON-ключе настроек. */
export interface BadgeCatalogDocument {
    mode: EnumBadgeMode;
    /** Свой набор портала; действует только в режиме `own`. */
    items: BadgeRecord[];
    /** Счётчик сохранений — человекочитаемый; надёжный компаратор — hash. */
    version: number;
    updatedAt: string | null;
    /** Битрикс-id сотрудника, сохранившего каталог. */
    updatedBy: number | null;
}

/**
 * Реестр целиком — ответ `GET /schema`. Коды здесь — строки, как на границе
 * HTTP: типизированные константы выше остаются источником, а наружу уходят
 * копии массивов (readonly-константы в DTO не отдаём).
 */
export interface BadgeSchemaPayload {
    contract: number;
    targets: BadgeRegistryOption[];
    modes: BadgeRegistryOption[];
    outcomes: BadgeRegistryOption[];
    planTypes: BadgeRegistryOption[];
    tones: BadgeRegistryOption[];
    textMaxLength: number;
    itemsMax: number;
}

export const getBadgeSchema = (): BadgeSchemaPayload => ({
    contract: BADGE_CATALOG_CONTRACT,
    targets: [...BADGE_TARGET_OPTIONS],
    modes: [...BADGE_MODE_OPTIONS],
    outcomes: [...BADGE_OUTCOME_OPTIONS],
    planTypes: [...BADGE_PLAN_TYPE_OPTIONS],
    tones: [...BADGE_TONE_OPTIONS],
    textMaxLength: BADGE_TEXT_MAX_LENGTH,
    itemsMax: BADGE_ITEMS_MAX,
});
