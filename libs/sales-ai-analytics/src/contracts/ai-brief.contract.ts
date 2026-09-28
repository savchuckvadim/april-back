/**
 * Контракт AI-резюме отчёта (план §8, версия 2 «что изменилось и что
 * делать»): пакет фактов (evidence pack) с прошлым периодом, буллеты трёх
 * групп, лимиты, стоп-слова и каузальные обороты.
 *
 * Строгая JSON-схема ответа модели — в `ai-brief.schema.ts`, правила
 * действий и фокуса шаблона — в `ai-brief.rules.ts` (лимит 300 строк).
 * Только типы и константы — без DI и без обращений к LLM.
 */

/**
 * Виды фактов пакета в порядке приоритета обрезки:
 * алерты → отклонения → финансы против плана → дисциплина → телефония →
 * качество данных (план §8).
 */
export const AI_BRIEF_FACT_KINDS = [
    'alert',
    'deviation',
    'finance',
    'discipline',
    'telephony',
    'data-quality',
] as const;
export type AiBriefFactKind = (typeof AI_BRIEF_FACT_KINDS)[number];

/** Приоритет фактов при обрезке пакета — порядок `AI_BRIEF_FACT_KINDS`. */
export const AI_BRIEF_FACT_PRIORITY: readonly AiBriefFactKind[] =
    AI_BRIEF_FACT_KINDS;

/** Единица измерения факта — задаёт форматирование и допуски факт-чека. */
export const AI_BRIEF_FACT_UNITS = [
    /** Штуки: звонки, презентации, сделки. */
    'count',
    /** Проценты 0–100. */
    'pct',
    /** Доля 0–1 (в тексте обычно печатается процентами). */
    'share',
    /** Рубли. */
    'rub',
    /** Секунды. */
    'sec',
    /** Дни. */
    'days',
    /** Оценка по шкале 1–10. */
    'score',
] as const;
export type AiBriefFactUnit = (typeof AI_BRIEF_FACT_UNITS)[number];

/**
 * Один факт пакета: число со своим кодом, подписью, готовой фразой и — с
 * версии 2 — значением за прошлый период той же длины (или нормой/планом).
 */
export interface AiBriefFact {
    /** Уникальный код факта — на него ссылается `AiBriefBullet.factRefs`. */
    code: string;
    kind: AiBriefFactKind;
    /** Короткая подпись факта для модели («Продаж за период»). */
    title: string;
    /** Значение факта; null — значение скрыто «честным мало данных». */
    value: number | null;
    unit: AiBriefFactUnit;
    /** Объём данных за фактом (n); попадает в допустимые числа буллета. */
    n?: number;
    /** Bitrix-id менеджера, к которому относится факт. */
    managerId?: string;
    /** Код типа звонка (CALL_REPORT_CALL_TYPE_CODES). */
    callType?: string;
    /** Готовая фраза факта: числа в ней уже отформатированы. */
    text: string;
    /** Значение за прошлый период той же длины; null — данных нет. */
    prev?: number | null;
    /** Изменение к прошлому периоду (value − prev) в единицах факта. */
    delta?: number | null;
    /** Изменение к прошлому периоду в процентах; null — prev ноль или нет. */
    deltaPct?: number | null;
    /** Есть сравнение с прошлым периодом (prev и delta заполнены). */
    comparable: boolean;
    /** С чем сравниваем, словами («за прошлый период», «месяц к месяцу»). */
    basis?: string;
    /** Норма (доля или число), если факт сравнивается с нормой. */
    norm?: number | null;
    /** План руководителя, если факт сравнивается с планом. */
    plan?: number | null;
    /** Ссылка на карточку разбора или раздел витрины; null — ссылки нет. */
    link?: string | null;
    /** Сигнал факта: код карточки «Внимания» или признак качества данных. */
    signal?: string;
}

/** Причины, по которым у пакета нет сравнения с прошлым периодом. */
export const AI_BRIEF_COMPARE_REASONS = {
    /** Прошлый период начинается раньше сравнимой истории портала. */
    beforeComparable: 'before-comparable',
    /** Данных за прошлый период нет ни в кэше, ни в снапшотах. */
    noData: 'no-data',
    /**
     * Расчёт не готов: джоба не дождалась обзора прошлого периода либо
     * обзора самого периода — сравнивать пока нечего.
     */
    prevNotReady: 'prev-not-ready',
} as const;
export type AiBriefCompareReason =
    (typeof AI_BRIEF_COMPARE_REASONS)[keyof typeof AI_BRIEF_COMPARE_REASONS];

/** Прошлый период сравнения той же длины, 'YYYY-MM-DD' в TZ портала. */
export interface BriefPeriod {
    from: string;
    to: string;
}

/** Состояние сравнения пакета с прошлым периодом — входит в хэш пакета. */
export interface BriefCompareStatus {
    /** Прошлый период сравнения; null — сравнения нет. */
    previousPeriod: BriefPeriod | null;
    /** Почему сравнения нет; null — сравнение есть. */
    reason: AiBriefCompareReason | null;
}

/** Пакет фактов после обрезки: то, что уходит в модель и в факт-чек. */
export interface AiEvidencePack {
    readonly facts: readonly AiBriefFact[];
    /** sha256 канонического JSON пакета — ключ кэша и `activity_id`. */
    readonly hash: string;
    /** Коды фактов, не попавших в пакет из-за лимитов. */
    readonly droppedCodes: readonly string[];
    /** Сравнение с прошлым периодом: период и причина его отсутствия. */
    readonly compare: BriefCompareStatus;
}

/**
 * Группы буллетов резюме: что изменилось, на кого смотреть, что сделать.
 * Порядок — порядок вывода на витрине.
 */
export const AI_BRIEF_BULLET_GROUPS = ['change', 'focus', 'action'] as const;
export type AiBriefBulletGroup = (typeof AI_BRIEF_BULLET_GROUPS)[number];

/**
 * Группы, которые пишет нейросеть. Действия в её ответ не входят: они
 * всегда выводятся правилами из пакета фактов (`actionBullets`), чтобы
 * ни одно действие не появилось без факта за ним.
 */
export const AI_BRIEF_MODEL_GROUPS = [
    'change',
    'focus',
] as const satisfies readonly AiBriefBulletGroup[];
export type AiBriefModelGroup = (typeof AI_BRIEF_MODEL_GROUPS)[number];

/** Буллет резюме: группа, текст, адресат, ссылка и ссылки на факты пакета. */
export interface AiBriefBullet {
    text: string;
    group: AiBriefBulletGroup;
    managerId?: string;
    callType?: string;
    /**
     * Коды фактов пакета; пусто только у служебных пунктов без чисел —
     * «сравнения с прошлым периодом нет» и «действий не требуется».
     */
    factRefs: readonly string[];
    /** Ссылка на карточку разбора или раздел витрины; null — ссылки нет. */
    link?: string | null;
    /** Изменение к прошлому периоду в единицах факта; null — сравнения нет. */
    delta?: number | null;
}

/** Тон резюме: спокойный, требующий внимания, тревожный. */
export const AI_BRIEF_TONES = ['calm', 'attention', 'alarm'] as const;
export type AiBriefTone = (typeof AI_BRIEF_TONES)[number];

/** Разобранный и проверенный ответ модели. */
export interface AiBriefPayload {
    headline: string;
    bullets: readonly AiBriefBullet[];
    tone: AiBriefTone;
}

/** Источник резюме: ответ модели либо шаблон без LLM. */
export const AI_BRIEF_SOURCES = ['llm', 'template'] as const;
export type AiBriefSource = (typeof AI_BRIEF_SOURCES)[number];

/** Итог сборки резюме — то, что кладётся в снапшот и в DTO. */
export interface AiBriefResult extends AiBriefPayload {
    source: AiBriefSource;
    /** Хэш пакета, по которому собрано резюме. */
    packHash: string;
    /** Момент сборки в ISO; приходит параметром, не из `Date.now()`. */
    generatedAt: string;
    promptVersion: string;
    /** Причина шаблона (`no-llm-key`, `factcheck-failed`…); null для llm. */
    reason: string | null;
}

/** Лимиты резюме и пакета (план §8, версия 2). */
export const AI_BRIEF_LIMITS = {
    /** Символов в заголовке. */
    headline: 140,
    /** Слов в буллете. */
    bulletWords: 30,
    /** Буллетов в резюме (сумма по группам). */
    bullets: 10,
    /** Буллетов на группу. */
    groups: { change: 4, focus: 3, action: 3 } satisfies Record<
        AiBriefBulletGroup,
        number
    >,
    /** Байт в пакете фактов (факты фокуса несут заголовок и ссылку). */
    packBytes: 8192,
    /** Фактов в пакете. */
    packFacts: 16,
    /** Меньше — резюме заменяется шаблоном. */
    minBullets: 2,
} as const;
export type AiBriefLimits = typeof AI_BRIEF_LIMITS;

/**
 * Версия промпта резюме; входит в ключ кэша, смена рвёт сравнимость
 * резюме между периодами. 2.0.0 — группы буллетов и прошлый период.
 */
export const AI_BRIEF_PROMPT_VERSION = 'brief-2.0.0';

/**
 * Стоп-слова резюме: сравниваются по корню в нижнем регистре.
 * «Значимо» запрещено до Фазы 3 (плана §4.11) — статистической значимости
 * модель не считает, и выдавать её словами нельзя.
 */
export const AI_BRIEF_FORBIDDEN = [
    'значим',
    'статистическ',
    'достоверн',
    'доказыва',
    'гарантир',
    'p-value',
    'p <',
    'критическ',
] as const;

/** Каузальные обороты: связь «причина → следствие» модель утверждать не вправе. */
export const AI_BRIEF_CAUSAL = [
    'из-за',
    'потому что',
    'привел',
    'привёл',
    'вызвал',
    'повлиял',
    'благодаря',
    'в результате',
    'следствие',
    'поэтому',
] as const;

/** Причины отбраковки буллета факт-чеком. */
export const AI_BRIEF_DROP_REASONS = {
    /** Пустой текст буллета. */
    empty: 'empty-text',
    /** Буллет длиннее лимита слов. */
    tooManyWords: 'bullet-too-long',
    /**
     * Буллетов больше общего лимита. С версии 2 лимиты групп срабатывают
     * раньше; код остаётся ради записей снапшотов прежней версии.
     */
    overLimit: 'bullets-over-limit',
    /** Нет ни одной ссылки на факт. */
    noFactRefs: 'no-fact-refs',
    /** Ссылка на факт, которого нет в пакете. */
    unknownFactRef: 'unknown-fact-ref',
    /** Число в тексте отсутствует в пакете фактов. */
    numberNotInPack: 'number-not-in-pack',
    /** Стоп-слово. */
    forbiddenWord: 'forbidden-word',
    /** Каузальная формулировка. */
    causal: 'causal-claim',
    /** Битая форма буллета в ответе модели. */
    malformed: 'malformed-bullet',
    /** Группа не задана, неизвестна или не входит в группы нейросети. */
    groupUnknown: 'group-unknown',
    /** Буллетов группы больше лимита группы. */
    groupOverLimit: 'group-over-limit',
    /** Ссылка буллета не совпадает ни с одной ссылкой фактов пакета. */
    unknownLink: 'unknown-link',
    /** Менеджер буллета фокуса не принадлежит ни одному факту из factRefs. */
    managerNotInRefs: 'manager-not-in-refs',
} as const;
export type AiBriefDropReason =
    (typeof AI_BRIEF_DROP_REASONS)[keyof typeof AI_BRIEF_DROP_REASONS];

/** Причины шаблонного резюме вместо ответа модели. */
export const AI_BRIEF_TEMPLATE_REASONS = {
    /** Нет ключа LLM у портала. */
    noLlmKey: 'no-llm-key',
    /** Исчерпана дневная квота brief_quota_per_day. */
    quotaExceeded: 'quota-exceeded',
    /** Ответ модели не разобрался по строгой схеме. */
    invalidPayload: 'invalid-payload',
    /** После факт-чека осталось меньше AI_BRIEF_LIMITS.minBullets буллетов. */
    factcheckFailed: 'factcheck-failed',
    /** Модель не ответила (сеть, таймаут). */
    llmUnavailable: 'llm-unavailable',
} as const;
export type AiBriefTemplateReason =
    (typeof AI_BRIEF_TEMPLATE_REASONS)[keyof typeof AI_BRIEF_TEMPLATE_REASONS];
