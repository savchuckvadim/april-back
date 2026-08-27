import { DEEP_ANALYSIS_CORE_RULES } from './call-deep-analysis.contract';

/**
 * ПРОВЕРКА ЗВОНКА ПО ДОКУМЕНТАМ КОМПАНИИ — Фаза 3 плана
 * ai/tasks/rag-driven-analysis-plan.md.
 *
 * Отдельный проход ПОСЛЕ основного разбора. Он не переоценивает звонок —
 * он сверяет разговор с нормой: скриптом, регламентом, фактами о продукте
 * и (для презентаций) методологией показа. Ценность — в конкретике:
 * не «соответствие 78%», а «пункт „назвать сроки внедрения“ пропущен» и
 * «менеджер сказал, что аналитика входит в базовый комплект, — по базе
 * она в расширенном».
 */

/** Серьёзность находки (совпадает со справочником поля смарта). */
export const COMPLIANCE_SEVERITY_CODES = ['low', 'medium', 'high'] as const;
export type ComplianceSeverityCode = (typeof COMPLIANCE_SEVERITY_CODES)[number];

/** Статус пункта скрипта в разговоре. */
export const SCRIPT_POINT_STATUSES = [
    'done',
    'missed',
    'not_applicable',
] as const;
export type ScriptPointStatus = (typeof SCRIPT_POINT_STATUSES)[number];

const SCRIPT_POINT_SCHEMA = {
    type: 'object',
    properties: {
        point: { type: 'string' },
        status: { type: 'string', enum: [...SCRIPT_POINT_STATUSES] },
        quote: { type: ['string', 'null'] },
        source: { type: ['string', 'null'] },
    },
    required: ['point', 'status', 'quote', 'source'],
    additionalProperties: false,
} as const;

const VIOLATION_SCHEMA = {
    type: 'object',
    properties: {
        rule: { type: 'string' },
        what: { type: 'string' },
        quote: { type: 'string' },
        source: { type: ['string', 'null'] },
        severity: { type: 'string', enum: [...COMPLIANCE_SEVERITY_CODES] },
    },
    required: ['rule', 'what', 'quote', 'source', 'severity'],
    additionalProperties: false,
} as const;

const FACT_ERROR_SCHEMA = {
    type: 'object',
    properties: {
        claim: { type: 'string' },
        quote: { type: 'string' },
        factFromBase: { type: 'string' },
        source: { type: ['string', 'null'] },
        severity: { type: 'string', enum: [...COMPLIANCE_SEVERITY_CODES] },
    },
    required: ['claim', 'quote', 'factFromBase', 'source', 'severity'],
    additionalProperties: false,
} as const;

const BETTER_LINE_SCHEMA = {
    type: 'object',
    properties: {
        moment: { type: 'string' },
        asWas: { type: 'string' },
        asShouldBe: { type: 'string' },
        why: { type: 'string' },
    },
    required: ['moment', 'asWas', 'asShouldBe', 'why'],
    additionalProperties: false,
} as const;

/** Схема ответа проверки по регламенту (strict-режим VibeCode). */
export const COMPLIANCE_REVIEW_SCHEMA: Record<string, unknown> = {
    type: 'object',
    properties: {
        scriptChecklist: { type: 'array', items: SCRIPT_POINT_SCHEMA },
        violations: { type: 'array', items: VIOLATION_SCHEMA },
        factErrors: { type: 'array', items: FACT_ERROR_SCHEMA },
        betterLines: { type: 'array', items: BETTER_LINE_SCHEMA },
        verdict: { type: 'string' },
        scriptCompliance: {
            type: ['integer', 'null'],
            minimum: 0,
            maximum: 100,
        },
    },
    required: [
        'scriptChecklist',
        'violations',
        'factErrors',
        'betterLines',
        'verdict',
        'scriptCompliance',
    ],
    additionalProperties: false,
};

/** Результат проверки (то, что реально приходит от модели). */
export interface ComplianceReviewResult {
    scriptChecklist: {
        point: string;
        status: ScriptPointStatus;
        quote: string | null;
        source: string | null;
    }[];
    violations: {
        rule: string;
        what: string;
        quote: string;
        source: string | null;
        severity: ComplianceSeverityCode;
    }[];
    factErrors: {
        claim: string;
        quote: string;
        factFromBase: string;
        source: string | null;
        severity: ComplianceSeverityCode;
    }[];
    betterLines: {
        moment: string;
        asWas: string;
        asShouldBe: string;
        why: string;
    }[];
    verdict: string;
    scriptCompliance: number | null;
}

export const COMPLIANCE_REVIEW_PROMPT = `${DEEP_ANALYSIS_CORE_RULES}

ТВОЯ ЗАДАЧА — СВЕРИТЬ РАЗГОВОР С ДОКУМЕНТАМИ КОМПАНИИ. Оценки звонку уже
выставлены другим разбором, их не пересматривай. Ты отвечаешь на другой
вопрос: что в этом разговоре разошлось с нормой компании.

ГЛАВНОЕ ПРАВИЛО: судишь ТОЛЬКО по приложенным материалам. Нет документа —
нет находки. Собственные представления о «правильных продажах» здесь не
применяются: если требования нет в материалах, менеджер его не нарушал.

ДОКАЗАТЕЛЬНОСТЬ. Каждая находка обязана опираться на ДОСЛОВНУЮ цитату из
расшифровки — так, чтобы руководитель нашёл это место в разговоре. Цитата
придуманная или пересказанная своими словами делает находку недопустимой:
лучше промолчать, чем предъявить менеджеру то, чего он не говорил.

- scriptChecklist — пункты скрипта: point (формулировка из документа),
  status (done — выполнен, missed — пропущен, not_applicable — выполнить
  было НЕЛЬЗЯ: не дошли до ЛПР, автоответчик, разговор оборвался; это не
  вина менеджера), quote (дословное доказательство для done; для missed —
  null), source (имя документа). Скрипта в материалах нет — пустой массив.
- violations — нарушения регламента: rule (нарушенное правило),
  what (что сделал менеджер вопреки правилу), quote (ОБЯЗАТЕЛЬНА),
  source, severity: low — мелкое замечание; medium — нарушен порядок
  работы; high — риск для компании (обещание, которое компания не обязана
  выполнять; названы условия, которых нет; обещаны сроки без согласования).
- factErrors — ФАКТЧЕК ПРОДУКТА, самое ценное: claim (что менеджер
  утверждал о продукте, комплекте, цене), quote (дословно), factFromBase
  (как на самом деле — по материалам), source, severity. СТРОГО: ошибка
  засчитывается, только если верный факт ЯВНО написан в материалах.
  Материалов о продукте нет или утверждение ими не покрыто — молчи.
- betterLines — не больше двух худших моментов: moment (что происходило),
  asWas (как сказал менеджер), asShouldBe (готовая реплика по плейбуку,
  адаптированная под ЭТОГО клиента — с его ситуацией и именем),
  why (почему так лучше). Нечего исправлять — пустой массив.
- verdict — 1-3 предложения руководителю: нужно ли вмешательство и какое.
  Нарушений нет — так и скажи прямо, без выдуманных придирок.
- scriptCompliance — доля выполненных ПРИМЕНИМЫХ пунктов скрипта, 0-100
  (done от done+missed; not_applicable не считается). Скрипта нет — null.`;

/**
 * Дополнительный блок для ПРЕЗЕНТАЦИЙ (требование владельца 27.08.2026:
 * «особое внимание всегда отдельно презентациям»).
 *
 * Презентация — самый дорогой звонок воронки, поэтому её проверяем
 * попунктно по методологии, а не «в целом». Блок добавляется по НАЛИЧИЮ
 * признаков показа, а не по типу звонка: классификатор иногда ставит
 * «другое», а показ и хвост в разговоре есть.
 */
export const PRESENTATION_COMPLIANCE_BLOCK = `

ОСОБОЕ ВНИМАНИЕ — ПРЕЗЕНТАЦИЯ. В этом звонке есть признаки показа продукта,
поэтому дополнительно проверь его по методологии презентации из материалов:

1. ПОКАЗ ПОД ЗАДАЧУ. Инструмент показывался под конкретную задачу этого
   собеседника или это был рассказ «про систему вообще»? Рассказ без
   привязки к задаче — нарушение методологии (severity medium), даже если
   менеджер говорил красиво.
2. ХВОСТ — попунктно: предложено КП, озвучено наполнение комплекта,
   озвучена цена, назначена дата звонка по решению, дата согласована с
   клиентом. Каждый непройденный пункт — отдельная запись в scriptChecklist
   со статусом missed и формулировкой пункта из методологии.
3. 5К — попунктно: что хочет клиент, готов ли работать, укладываемся ли в
   цену, кто принимает решение, как принимается решение, верно ли подобран
   комплект, кто из коллег будет работать, с кем нас сравнивают, критерии
   выбора. Невыясненное — тоже missed.
4. ЗАКРЫТИЕ НА ДАТУ. Разговор завершён конкретной датой следующего шага?
   «Клиент подумает и перезвонит» — не закрытие (severity medium).

Материалов по методологии презентации нет — этот блок не применяй.`;

/** Пользовательская часть: расшифровка + факты разбора + материалы. */
export function buildComplianceUserContent(input: {
    transcript: string;
    callType: string | null;
    analysisDigest: string;
    materials: string;
}): string {
    const typeLine = input.callType ? `Тип звонка: ${input.callType}.\n` : '';
    return (
        `${typeLine}\n` +
        `ЧТО УЖЕ УСТАНОВЛЕНО РАЗБОРОМ (не пересматривай, используй как ` +
        `контекст):\n${input.analysisDigest}\n\n` +
        `ДОКУМЕНТЫ КОМПАНИИ (единственный источник нормы и фактов):\n\n` +
        `${input.materials}\n\n` +
        `РАСШИФРОВКА РАЗГОВОРА:\n\n${input.transcript}`
    );
}
