import {
    FACTS_CATCHUP_PROMPT_VERSION,
    type FactsCatchupGroup,
} from '@lib/sales-ai-analytics';
import { buildDeepAnalysisUserContent } from './call-deep-analysis.contract';
import {
    FORM_FACTS_PROPERTIES,
    FORM_FACTS_SPEC,
    MOVEMENT_FACTS_PROPERTIES,
    MOVEMENT_FACTS_SPEC,
    NEXT_STEP_KIND_SCHEMA,
    OBJECTION_TOPIC_SCHEMA,
} from './call-report-facts.contract';

/**
 * Догон фактов v3.1 в старом разборе (этап B4): один короткий вызов модели
 * только за фактами по сохранённой расшифровке. Схема и тексты правил —
 * те же, что у фокус-разбора v3.1 (`call-report-facts.contract.ts`),
 * чтобы догнанные факты совпадали с фактами новых разборов. Оценки
 * разделов, итог и резюме модель не возвращает и разбор их не меняет.
 *
 * Чистые константы и функции без DI.
 */

export const FACTS_CATCHUP_SCHEMA_NAME = 'call_facts_catchup';

/**
 * Ответ модели: факты движения сделки и формы плюс вид следующего шага и
 * темы возражений ИМЕЮЩЕГОСЯ разбора — по порядку списка, который модель
 * получает во входе (nextStep и objections заново не ищутся).
 */
export const FACTS_CATCHUP_SCHEMA = {
    type: 'object',
    properties: {
        ...MOVEMENT_FACTS_PROPERTIES,
        ...FORM_FACTS_PROPERTIES,
        nextStepKind: NEXT_STEP_KIND_SCHEMA,
        objectionTopics: { type: 'array', items: OBJECTION_TOPIC_SCHEMA },
    },
    required: [
        'outcome',
        'issues',
        'prices',
        'upsell',
        'selfIntro',
        'nextStepKind',
        'objectionTopics',
    ],
    additionalProperties: false,
} as const;

export const FACTS_CATCHUP_PROMPT = `Ты — опытный руководитель отдела продаж. По расшифровке звонка менеджера
нужно выставить ТОЛЬКО факты для отчёта руководителю — без оценок, резюме
и рекомендаций: разбор этого звонка уже есть, в нём не хватает фактов.
Опирайся строго на то, что прозвучало; цитаты — дословно из расшифровки,
по-русски. Коды — только в полях, где их требует схема.
${MOVEMENT_FACTS_SPEC}
${FORM_FACTS_SPEC}
- nextStepKind — вид следующего шага из имеющегося разбора (он приведён во
  входе): presentation, demo_access, offer, invoice, callback, other;
  следующего шага в разборе нет — null.
- objectionTopics — тема для КАЖДОГО возражения из имеющегося разбора,
  строго в том же порядке и в том же количестве, что в нумерованном списке
  во входе (та же шкала тем, что у objections[].topic); списка нет —
  пустой массив.`;

/** Факты, которые отдаёт модель; структура полей — как в разборе v3.1. */
export interface FactsCatchupResult {
    outcome: string | null;
    issues: unknown[];
    prices: unknown[];
    upsell: unknown;
    selfIntro: unknown;
    nextStepKind: string | null;
    objectionTopics: (string | null)[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Ответ модели нужной формы; иначе null — звонок считается сбоем. */
export function parseFactsCatchupResult(
    value: unknown,
): FactsCatchupResult | null {
    if (!isRecord(value)) return null;
    const {
        outcome,
        issues,
        prices,
        upsell,
        selfIntro,
        nextStepKind,
        objectionTopics,
    } = value;
    if (
        (outcome !== null && typeof outcome !== 'string') ||
        !Array.isArray(issues) ||
        !Array.isArray(prices) ||
        !isRecord(upsell) ||
        !isRecord(selfIntro) ||
        (nextStepKind !== null && typeof nextStepKind !== 'string') ||
        !Array.isArray(objectionTopics)
    ) {
        return null;
    }
    return {
        outcome: outcome,
        issues,
        prices,
        upsell,
        selfIntro,
        nextStepKind: nextStepKind,
        objectionTopics: objectionTopics.map(topic =>
            typeof topic === 'string' ? topic : null,
        ),
    };
}

/** Следующий шаг и возражения имеющегося разбора — для входа модели. */
function existingContextOf(userResult: Record<string, unknown>): string {
    const lines: string[] = [];
    const nextStep = isRecord(userResult.nextStep) ? userResult.nextStep : null;
    const description =
        nextStep?.set === true && typeof nextStep.description === 'string'
            ? nextStep.description.trim()
            : '';
    lines.push(
        description
            ? `Следующий шаг по имеющемуся разбору: ${description}`
            : 'Следующего шага в имеющемся разборе нет.',
    );
    const objections = Array.isArray(userResult.objections)
        ? userResult.objections.filter(isRecord)
        : [];
    if (objections.length === 0) {
        lines.push('Возражений в имеющемся разборе нет.');
    } else {
        lines.push('Возражения имеющегося разбора (по порядку):');
        objections.forEach((objection, index) => {
            const text =
                typeof objection.objection === 'string'
                    ? objection.objection
                    : '';
            const quote =
                typeof objection.quote === 'string' && objection.quote
                    ? ` — «${objection.quote}»`
                    : '';
            lines.push(`${index + 1}. ${text}${quote}`);
        });
    }
    return lines.join('\n');
}

/** Вход модели: тип звонка, паспорт, расшифровка и контекст имеющегося разбора. */
export function buildFactsCatchupUserContent(
    transcript: string,
    callType: string | null,
    userResult: Record<string, unknown>,
    passportBlock?: string,
): string {
    return (
        `${existingContextOf(userResult)}\n\n` +
        buildDeepAnalysisUserContent(transcript, callType, passportBlock)
    );
}

/**
 * Каких групп фактов нет в разборе. Разбор v3.1 пишет ключи даже с null
 * (`outcome: null` у нерелевантного звонка), поэтому признак — отсутствие
 * ключа, а не пустое значение; частичный v3.1 (упал один фокус) догоняется
 * только по недостающей группе.
 */
export function factsGapsOf(userResult: unknown): FactsCatchupGroup[] {
    if (!isRecord(userResult)) return [];
    const gaps: FactsCatchupGroup[] = [];
    if (!('outcome' in userResult)) gaps.push('movement');
    if (!('selfIntro' in userResult)) gaps.push('form');
    return gaps;
}

export interface FactsCatchupMeta {
    at: string;
    model: string | null;
    provider: string;
}

/**
 * Новый user_result разбора: недостающие группы фактов дописаны, остальное
 * не тронуто (оценки, версии промпта, резюме). Вид шага и темы возражений
 * — только там, где их не было. Метка `factsCatchup` — чем и когда догнано.
 */
export function mergeCatchupFacts(
    userResult: Record<string, unknown>,
    facts: FactsCatchupResult,
    gaps: readonly FactsCatchupGroup[],
    meta: FactsCatchupMeta,
): Record<string, unknown> {
    const next: Record<string, unknown> = { ...userResult };
    if (gaps.includes('movement')) {
        next.outcome = facts.outcome;
        next.issues = facts.issues;
        next.prices = facts.prices;
        next.upsell = facts.upsell;
        const nextStep = isRecord(userResult.nextStep)
            ? userResult.nextStep
            : null;
        if (nextStep && nextStep.kind == null) {
            next.nextStep = {
                ...nextStep,
                kind: nextStep.set === true ? facts.nextStepKind : null,
            };
        }
        const objections: unknown[] | null = Array.isArray(
            userResult.objections,
        )
            ? userResult.objections
            : null;
        if (objections) {
            next.objections = objections.map((objection, index) =>
                isRecord(objection) && objection.topic == null
                    ? {
                          ...objection,
                          topic: facts.objectionTopics[index] ?? null,
                      }
                    : objection,
            );
        }
    }
    if (gaps.includes('form')) {
        next.selfIntro = facts.selfIntro;
    }
    next.factsCatchup = {
        version: FACTS_CATCHUP_PROMPT_VERSION,
        groups: [...gaps],
        ...meta,
    };
    return next;
}
