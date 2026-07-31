import {
    CALL_REPORT_SECTIONS,
    CALL_REPORT_SECTION_CODES,
    CALL_REPORT_COACHING_CODES,
    CALL_REPORT_INTERLOCUTOR_CODES,
    CALL_REPORT_SENTIMENT_CODES,
} from '@lib/call-lib';

/**
 * Контракт ГЛУБОКОГО разбора звонка: strict JSON-схема ответа модели +
 * системный промпт. Состав ответа повторяет поля смарта «AI-анализ
 * звонков», поэтому схема строится из тех же констант разделов
 * (CALL_REPORT_SECTIONS) — новый раздел в смарте автоматически попадает
 * в схему и в промпт, рассинхрона быть не может.
 *
 * Живёт в call-report, а не в libs/vibecode: состав разбора — предметная
 * область приложения, транспорт же принимает любую схему через
 * VibeCodeClient.structuredCompletion.
 *
 * ВАЖНО про strict-режим: провайдер требует, чтобы КАЖДОЕ свойство было
 * перечислено в required, а additionalProperties было false. Поэтому
 * «необязательные» поля объявлены как union с null, а не пропущены.
 */

/** Разделы разбора — ровно те, что заведены полями смарта. */
const SECTION_ITEM_SCHEMA = {
    type: 'object',
    properties: {
        section: { type: 'string', enum: [...CALL_REPORT_SECTION_CODES] },
        relevance: { type: 'integer', minimum: 0, maximum: 100 },
        score: { type: ['integer', 'null'], minimum: 1, maximum: 10 },
        asWas: { type: ['string', 'null'] },
        weaknesses: { type: ['string', 'null'] },
        alternatives: { type: 'array', items: { type: 'string' } },
        analysis: { type: ['string', 'null'] },
        advice: { type: ['string', 'null'] },
    },
    required: [
        'section',
        'relevance',
        'score',
        'asWas',
        'weaknesses',
        'alternatives',
        'analysis',
        'advice',
    ],
    additionalProperties: false,
} as const;

const NEXT_STEP_SCHEMA = {
    type: 'object',
    properties: {
        set: { type: 'boolean' },
        description: { type: ['string', 'null'] },
        date: { type: ['string', 'null'] },
    },
    required: ['set', 'description', 'date'],
    additionalProperties: false,
} as const;

const OBJECTION_SCHEMA = {
    type: 'object',
    properties: {
        objection: { type: 'string' },
        handling: { type: ['string', 'null'] },
        handled: { type: ['boolean', 'null'] },
        quote: { type: ['string', 'null'] },
    },
    required: ['objection', 'handling', 'handled', 'quote'],
    additionalProperties: false,
} as const;

/** Схема ответа модели для глубокого разбора звонка. */
export const CALL_DEEP_ANALYSIS_SCHEMA: Record<string, unknown> = {
    type: 'object',
    properties: {
        summary: { type: 'string' },
        productive: { type: 'boolean' },
        needsFound: { type: 'boolean' },
        presentationDone: { type: 'boolean' },
        priceDiscussed: { type: 'boolean' },
        interlocutorRole: {
            type: ['string', 'null'],
            enum: [...CALL_REPORT_INTERLOCUTOR_CODES, null],
        },
        sentiment: {
            type: ['string', 'null'],
            enum: [...CALL_REPORT_SENTIMENT_CODES, null],
        },
        nextStep: NEXT_STEP_SCHEMA,
        needs: { type: 'array', items: { type: 'string' } },
        productsOffered: { type: 'array', items: { type: 'string' } },
        objections: { type: 'array', items: OBJECTION_SCHEMA },
        recommendations: { type: 'array', items: { type: 'string' } },
        sections: { type: 'array', items: SECTION_ITEM_SCHEMA },
        speechAnalysis: { type: ['string', 'null'] },
        score: { type: 'integer', minimum: 1, maximum: 10 },
        scoreExplanation: { type: ['string', 'null'] },
        scriptCompliance: {
            type: ['integer', 'null'],
            minimum: 0,
            maximum: 100,
        },
        coachingPriority: {
            type: ['string', 'null'],
            enum: [...CALL_REPORT_COACHING_CODES, null],
        },
        employeeRecommendations: { type: ['string', 'null'] },
    },
    required: [
        'summary',
        'productive',
        'needsFound',
        'presentationDone',
        'priceDiscussed',
        'interlocutorRole',
        'sentiment',
        'nextStep',
        'needs',
        'productsOffered',
        'objections',
        'recommendations',
        'sections',
        'speechAnalysis',
        'score',
        'scoreExplanation',
        'scriptCompliance',
        'coachingPriority',
        'employeeRecommendations',
    ],
    additionalProperties: false,
};

/** Каталог разделов для промпта — из того же источника, что и схема. */
const SECTION_CATALOG = CALL_REPORT_SECTIONS.map(
    section => `- '${section.code}' — ${section.title}`,
).join('\n');

/**
 * Системный промпт разбора. Написан по эталонам качества
 * (docs/airag-result-example): рекомендации — готовыми репликами, разбор —
 * с причинными цепочками, неприменимые разделы гасятся relevance=0.
 *
 * Дополняется материалами базы знаний (kind call-analysis-{тип звонка})
 * — там живут скрипты и методички конкретного портала.
 */
export const CALL_DEEP_ANALYSIS_SYSTEM_PROMPT = `Ты — руководитель отдела продаж компании «Гарант», разбираешь звонок менеджера.
Твой разбор читают менеджер и РОП, поэтому он должен быть конкретным и применимым сразу.

ГЛАВНЫЕ ПРАВИЛА:
- Пиши только по-русски.
- Опирайся на фактическое содержание разговора. Не выдумывай реплик, которых не было.
- В рекомендациях давай ГОТОВЫЕ ФОРМУЛИРОВКИ, которые менеджер может произнести дословно,
  а не абстракции вида «улучшить контакт». Плохо: «нужно выявлять потребности».
  Хорошо: «Спросить: „С какими категориями дел вы сталкиваетесь чаще всего?“».
- Разбор строй причинными цепочками: возражение по цене ← слабая презентация выгод ←
  не выявлены потребности.
- Не вставляй в текст служебные пометки, шаблоны и заголовки полей.

РАЗДЕЛЫ РАЗБОРА (верни все до одного, порядок любой):
${SECTION_CATALOG}

По каждому разделу:
- relevance (0-100) — насколько раздел применим К ЭТОМУ звонку. Если этап неприменим
  (например, «Работа по цене» в звонке-недозвоне) — relevance 0, score null,
  тексты null, alternatives пустой массив. Такой раздел не влияет на итог.
- score (1-10) — обязателен, когда relevance > 0.
- asWas — как было на самом деле, по возможности с цитатой из разговора.
- weaknesses — что в таком подходе плохо и к каким последствиям это ведёт.
- alternatives — 1-3 варианта «как можно было по-другому», каждый готовой репликой.
- analysis — разбор с причинной связью.
- advice — что менеджеру потренировать.

ИТОГОВЫЕ ПОЛЯ:
- summary — краткое описание разговора и достигнутых договорённостей: о чём говорили,
  что обещали мы, что обещал клиент.
- productive — был ли звонок результативным (состоялся контакт и есть продвижение).
- nextStep.set — договорились ли о конкретном следующем шаге. «Клиент подумает» —
  это НЕ следующий шаг. description — что именно, date — YYYY-MM-DD или null.
- objections — каждое возражение клиента: сама формулировка, как менеджер его отработал,
  удалось ли, дословная цитата если есть.
- speechAnalysis — разбор речи: структура спича, приём «свойство-связка-выгода»,
  темп, слова-паразиты, заученность.
- score (1-10) — общая оценка звонка в контексте его этапа продаж, только по применимым
  разделам. scoreExplanation — из чего сложилась и что перевесило.
- scriptCompliance (0-100) — соответствие скрипту из материалов базы знаний; null,
  если скрипта в материалах нет.
- coachingPriority — насколько срочно менеджеру нужен разбор с РОПом.
- employeeRecommendations — что этому сотруднику развивать на дистанции.`;

/** Пользовательская часть запроса: транскрипт с типом звонка. */
export function buildDeepAnalysisUserContent(
    transcript: string,
    callType: string | null,
): string {
    const typeLine = callType
        ? `Тип звонка по классификатору: ${callType}.\n\n`
        : '';
    return `${typeLine}Разбери звонок по расшифровке:\n\n${transcript}`;
}
