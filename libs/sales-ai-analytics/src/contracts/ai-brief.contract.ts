/**
 * Контракт AI-резюме отчёта (план §8): пакет фактов (evidence pack),
 * строгая схема ответа модели, лимиты, стоп-слова и каузальные обороты.
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

/** Один факт пакета: число со своим кодом, подписью и готовой фразой. */
export interface AiBriefFact {
    /** Уникальный код факта — на него ссылается `AiBriefBullet.factRefs`. */
    code: string;
    kind: AiBriefFactKind;
    /** Короткая подпись факта для модели («Продажи против плана»). */
    title: string;
    /** Значение факта; null — значение скрыто «честным мало данных». */
    value: number | null;
    unit: AiBriefFactUnit;
    /** Объём данных за факом (n); попадает в допустимые числа буллета. */
    n?: number;
    /** Bitrix-id менеджера, к которому относится факт. */
    managerId?: string;
    /** Код типа звонка (CALL_REPORT_CALL_TYPE_CODES). */
    callType?: string;
    /** Готовая фраза факта: числа в ней уже отформатированы. */
    text: string;
}

/** Пакет фактов после обрезки: то, что уходит в модель и в факт-чек. */
export interface AiEvidencePack {
    readonly facts: readonly AiBriefFact[];
    /** sha256 канонического JSON пакета — ключ кэша и `activity_id`. */
    readonly hash: string;
    /** Коды фактов, не попавших в пакет из-за лимитов. */
    readonly droppedCodes: readonly string[];
}

/** Буллет резюме: текст, адресат и ссылки на факты пакета. */
export interface AiBriefBullet {
    text: string;
    managerId?: string;
    callType?: string;
    factRefs: readonly string[];
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

/** Лимиты резюме и пакета (план §8). */
export const AI_BRIEF_LIMITS = {
    /** Символов в заголовке. */
    headline: 140,
    /** Слов в буллете. */
    bulletWords: 30,
    /** Буллетов в резюме. */
    bullets: 5,
    /** Байт в пакете фактов. */
    packBytes: 4096,
    /** Фактов в пакете. */
    packFacts: 10,
    /** Меньше — резюме заменяется шаблоном. */
    minBullets: 2,
} as const;
export type AiBriefLimits = typeof AI_BRIEF_LIMITS;

/** Версия промпта резюме; смена рвёт сравнимость резюме между периодами. */
export const AI_BRIEF_PROMPT_VERSION = 'brief-1.0.0';

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
    '因',
] as const;

/** Причины отбраковки буллета факт-чеком. */
export const AI_BRIEF_DROP_REASONS = {
    /** Пустой текст буллета. */
    empty: 'empty-text',
    /** Буллет длиннее лимита слов. */
    tooManyWords: 'bullet-too-long',
    /** Буллетов больше лимита — лишние отбрасываются. */
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

/**
 * Строгая JSON-схема ответа модели для
 * `VibeCodeClient.structuredCompletionWithUsage` (`Record<string, unknown>`).
 * Дополнительные поля запрещены — всё, что не описано, отбрасывается
 * `validateBriefPayload`.
 */
export const AI_BRIEF_JSON_SCHEMA: Record<string, unknown> = {
    type: 'object',
    additionalProperties: false,
    required: ['headline', 'bullets', 'tone'],
    properties: {
        headline: {
            type: 'string',
            maxLength: AI_BRIEF_LIMITS.headline,
            description: 'Заголовок резюме, до 140 символов, без причинности.',
        },
        tone: {
            type: 'string',
            enum: [...AI_BRIEF_TONES],
            description: 'Тон резюме: calm | attention | alarm.',
        },
        bullets: {
            type: 'array',
            minItems: 1,
            maxItems: AI_BRIEF_LIMITS.bullets,
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['text', 'factRefs'],
                properties: {
                    text: {
                        type: 'string',
                        description:
                            'Буллет до 30 слов; каждое число — из пакета фактов.',
                    },
                    managerId: {
                        type: 'string',
                        description: 'Bitrix-id менеджера факта, если он один.',
                    },
                    callType: {
                        type: 'string',
                        description: 'Код типа звонка, если буллет про тип.',
                    },
                    factRefs: {
                        type: 'array',
                        minItems: 1,
                        items: { type: 'string' },
                        description: 'Коды фактов пакета, на которых буллет.',
                    },
                },
            },
        },
    },
};

/** Имя схемы для strict-JSON вызова модели. */
export const AI_BRIEF_SCHEMA_NAME = 'ai_analytics_brief';
