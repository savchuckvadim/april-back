import {
    CALL_REPORT_COMPETITOR_CODES,
    CALL_REPORT_REFUSAL_CODES,
} from '@lib/call-lib';
import {
    DEEP_ANALYSIS_RULES_WITH_CONNECTION_LOST,
    FIVE_K_CHECKLIST_SPEC,
    FIVE_K_ITEMS_SCHEMA,
    HVOST_CHECKLIST_SPEC,
    FLOW_SCHEMA,
    HVOST_STEPS_SCHEMA,
    NEXT_STEP_SCHEMA,
    OBJECTION_SCHEMA,
    OBJECTION_TIMECODE_SPEC,
    SECTION_FIELDS_SPEC,
} from './call-deep-analysis.contract';
import {
    focusCatalog,
    focusSectionsSchema,
} from './call-focus-sections.contract';
import {
    CLOSING_FACTS_PROPERTIES,
    CLOSING_FACTS_SPEC,
    OBJECTIONS_PRICE_FACTS_PROPERTIES,
    OBJECTIONS_PRICE_FACTS_REQUIRED,
    OBJECTIONS_PRICE_FACTS_SPEC,
} from './call-report-facts.contract';
import {
    RISK_EVIDENCE_LIST_SCHEMA,
    RISK_FLAGS_SCHEMA,
    RISK_FLAGS_SPEC,
} from './call-risk-flags.contract';

/**
 * Проходы «движения сделки» (focus-v3.3, 17.11.2026). Раньше это был один
 * проход `movement` с самой большой схемой разбора — на длинных звонках он не
 * укладывался в срок ответа модели. Теперь их два, с непересекающимися
 * схемами, и оба идут параллельно с остальными проходами:
 * - `movement` — «возражения и цена» (разделы OBJECTIONS, PRICE);
 * - `closing` — «закрытие и следующий шаг» (разделы CLOSING, REFUSAL).
 * Объединение их схем — прежняя схема единого прохода; для итогового разбора
 * ничего не меняется, меняется лишь вызов, который приносит поля.
 */

/**
 * Продвижение сделки по звонку (раздел 7.1 материалов методики; ядро для
 * всех порталов с v3.0): шкала 1–5 с обязательным комментарием; null — для
 * типа звонка не применимо.
 */
export const DEAL_PROGRESS_SCHEMA: Record<string, unknown> = {
    type: ['object', 'null'],
    properties: {
        score: { type: 'integer', minimum: 1, maximum: 5 },
        before: { type: 'string' },
        after: { type: 'string' },
        why: { type: 'string' },
        whyNotHigher: { type: 'string' },
    },
    required: ['score', 'before', 'after', 'why', 'whyNotHigher'],
    additionalProperties: false,
};

// ---------------------------------------------------------------------------
// ФОКУС «ВОЗРАЖЕНИЯ И ЦЕНА»: сопротивление клиента, цена, риск-флаги.
// ---------------------------------------------------------------------------

export const FOCUS_MOVEMENT_SCHEMA: Record<string, unknown> = {
    type: 'object',
    properties: {
        sections: focusSectionsSchema('movement'),
        objections: { type: 'array', items: OBJECTION_SCHEMA },
        priceDiscussed: { type: 'boolean' },
        competitors: {
            type: 'array',
            items: { type: 'string', enum: [...CALL_REPORT_COMPETITOR_CODES] },
        },
        riskFlags: RISK_FLAGS_SCHEMA,
        // Доказательства флагов (focus-v2.4): флаг без цитаты снимается.
        riskEvidence: RISK_EVIDENCE_LIST_SCHEMA,
        // Факты для отчётов руководителю (focus-v3.1, 06.11.2026): сбои и
        // цены.
        ...OBJECTIONS_PRICE_FACTS_PROPERTIES,
    },
    required: [
        'sections',
        'objections',
        'priceDiscussed',
        'competitors',
        'riskFlags',
        'riskEvidence',
        ...OBJECTIONS_PRICE_FACTS_REQUIRED,
    ],
    additionalProperties: false,
};

export const FOCUS_MOVEMENT_PROMPT = `${DEEP_ANALYSIS_RULES_WITH_CONNECTION_LOST}

ТВОЙ ФОКУС В ЭТОМ ЗАПРОСЕ — ТОЛЬКО ВОЗРАЖЕНИЯ И ЦЕНА: сопротивление клиента и
разговор о цене. Не оценивай приветствие, презентацию, закрытие разговора и
следующий шаг — этим занимаются другие проходы разбора. Твоя зона:
${focusCatalog('movement')}

ЖЕЛЕЗНОЕ ПРАВИЛО ФАКТОВ: если тема в разговоре НЕ звучала (цена не
обсуждалась, возражений не было, конкуренты не упоминались) — ставь
priceDiscussed=false, пустые массивы, relevance раздела по ситуации этапа —
и НЕ выдумывай разбор несуществующей темы.

${SECTION_FIELDS_SPEC}

ДОПОЛНИТЕЛЬНЫЕ ПОЛЯ ТВОЕГО ФОКУСА
- objections — каждое возражение: формулировка, отработка, удалось ли, дословная
  цитата, категория и тема (topic — см. факты ниже). Считай возражением и
  СКРЫТОЕ сопротивление: «у нас уже есть
  Консультант», «пришлите на почту», «надо посоветоваться».
  ${OBJECTION_TIMECODE_SPEC}
- priceDiscussed — обсуждалась ли цена фактически.
- competitors — конкуренты, упомянутые клиентом (коды справочника).

${OBJECTIONS_PRICE_FACTS_SPEC}

${RISK_FLAGS_SPEC}`;

// ---------------------------------------------------------------------------
// ФОКУС «ЗАКРЫТИЕ И СЛЕДУЮЩИЙ ШАГ»: чем закончился разговор, отказ, шаг,
// продвижение сделки, «хвост» и «5К», черновик отчёта менеджера.
// ---------------------------------------------------------------------------

/**
 * «Хвост» и «5К» в схеме прохода (boolean — фильтры смарта; *_Analysis —
 * отдельные записи в таймлайн элемента). В прежнем задании — у всех звонков
 * (null для не-презентаций), с цитатами focus-v3.4 — только у презентации.
 */
export const CLOSING_CHECKLIST_PROPERTIES = {
    hvostDone: { type: ['boolean', 'null'] },
    hvostAnalysis: { type: ['string', 'null'] },
    hvostSteps: HVOST_STEPS_SCHEMA,
    fiveKDone: { type: ['boolean', 'null'] },
    fiveKAnalysis: { type: ['string', 'null'] },
    fiveKItems: FIVE_K_ITEMS_SCHEMA,
} as const;

/**
 * Схема прохода «закрытие»: разделы и поля чек-листов задаёт вызывающий
 * (прежнее задание или задание с цитатами); в strict-режиме обязательны все
 * поля, порядок required — порядок properties.
 */
export function focusClosingSchema(
    sections: Record<string, unknown>,
    checklists: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
    const properties = {
        sections,
        refusalCategory: {
            type: ['string', 'null'],
            enum: [...CALL_REPORT_REFUSAL_CODES, null],
        },
        refusalReason: { type: ['string', 'null'] },
        nextStep: NEXT_STEP_SCHEMA,
        dealProgress: DEAL_PROGRESS_SCHEMA,
        productive: { type: 'boolean' },
        ...checklists,
        flow: FLOW_SCHEMA,
        // Факты для отчётов руководителю (focus-v3.1, 06.11.2026): исход и
        // допродажа.
        ...CLOSING_FACTS_PROPERTIES,
    };
    return {
        type: 'object',
        properties,
        required: Object.keys(properties),
        additionalProperties: false,
    };
}

export const FOCUS_CLOSING_SCHEMA: Record<string, unknown> = focusClosingSchema(
    focusSectionsSchema('closing'),
    CLOSING_CHECKLIST_PROPERTIES,
);

/** Описания полей «хвоста» и «5К» в задании прохода «закрытие». */
export const CLOSING_CHECKLISTS_SPEC = `- hvostDone — ТОЛЬКО для презентации/звонка по решению: пройден ли «хвост»
  после демонстрации (вопросы ценности, кто будет работать, цена комплекта,
  механизм решения, договорённость о КП и ДАТЕ следующего звонка). Частично
  или «поработайте, я перезвоню» без даты — false. Для других типов — null.
- hvostAnalysis — вместе с hvostDone: разбор прохождения хвоста по этапам,
  каждый с новой строки, по ПЯТИ блокам «Хвоста» и в том же порядке, что в
  анкете менеджера: «1. ЖЕЛАНИЕ РАБОТАТЬ С ГАРАНТОМ — ✓/✗ …», «2. ЧТО
  ПРЕДЛОЖИЛИ — …», «3. РЕАКЦИЯ НА ЦЕНУ — …», «4. ПРОЦЕСС ПРИНЯТИЯ РЕШЕНИЯ —
  …», «5. ВЫХОД НА РЕШЕНИЕ — …»; в конце одна строка вывода. Для других
  типов — null.
- fiveKDone — ТОЛЬКО для презентации/звонка по решению: закрыты ли все пять
  «К» (КЛИЕНТ, КОМПАНИЯ, КОЛЛЕГИ, КОНКУРЕНТ, КРИТЕРИИ ВЫБОРА). Хотя бы один
  блок не выяснен — false. Для других типов — null.
- fiveKAnalysis — вместе с fiveKDone: по каждому блоку с новой строки, что
  выяснено (с конкретикой из разговора) или что осталось невыясненным:
  «КЛИЕНТ — …», «КОМПАНИЯ — …», «КОЛЛЕГИ — …», «КОНКУРЕНТ — …»,
  «КРИТЕРИИ ВЫБОРА — …». Для других типов — null. НЕВЫЯСНЕННОЕ — ТОЖЕ
  РЕЗУЛЬТАТ: если ни одна «К» не выяснена, всё равно перечисли их все с
  пометкой «не выяснено» — пустой разбор при заполненном итоге в карточке
  выглядит как сбой системы.
- hvostSteps — гранулярный «Хвост», ТЕ ЖЕ блоки, которые менеджер заполняет
  в своей анкете (true = тема раскрыта в разговоре, false = должна была
  прозвучать, но не прозвучала, null = тип звонка не презентация/решение):
${HVOST_CHECKLIST_SPEC}
- fiveKItems — гранулярные «5К», те же блоки анкеты менеджера
  (true = выяснено в разговоре, false = не выяснено, null = не тот тип
  звонка):
${FIVE_K_CHECKLIST_SPEC}`;

/**
 * Задание прохода «закрытие». withChecklists — спрашивать ли «хвост» и «5К»:
 * прежнее задание — всегда, с цитатами (focus-v3.4) — только у презентации.
 */
export const focusClosingPrompt = (
    withChecklists: boolean,
): string => `${DEEP_ANALYSIS_RULES_WITH_CONNECTION_LOST}

ТВОЙ ФОКУС В ЭТОМ ЗАПРОСЕ — ТОЛЬКО ЗАКРЫТИЕ РАЗГОВОРА И СЛЕДУЮЩИЙ ШАГ: чем
закончился разговор, отказ и его причина, договорённость о следующем контакте,
продвижение сделки, ${withChecklists ? '«хвост» и «5К», ' : ''}черновик отчёта менеджера. Не оценивай
приветствие, презентацию, возражения и цену — этим занимаются другие проходы
разбора. Твоя зона:
${focusCatalog('closing')}

ЖЕЛЕЗНОЕ ПРАВИЛО ФАКТОВ: если тема в разговоре НЕ звучала (отказа не было,
следующий шаг не назначили, допродажу не предлагали) — ставь
refusalCategory=null, refusalReason=null, nextStep.set=false,
upsell.attempted=false, relevance раздела по ситуации этапа — и НЕ выдумывай
разбор несуществующей темы.

${SECTION_FIELDS_SPEC}

ДОПОЛНИТЕЛЬНЫЕ ПОЛЯ ТВОЕГО ФОКУСА
- refusalCategory — при отказе: РЫНОЧНАЯ причина или ИСПОЛНИТЕЛЬСКАЯ; null без отказа.
- refusalReason — ПРИЧИНА ОТКАЗА СЛОВАМИ КЛИЕНТА, одно-два предложения по
  тому, что реально прозвучало: «работают с Консультантом, договор оплачен
  до декабря», «руководитель не согласовал бюджет до конца года». Не код и
  не пересказ этапа. Заполняй и при мягком отказе («не интересно»,
  «перезвоните через год»), если причина в разговоре названа. Причина не
  прозвучала или отказа не было — null, НЕ ДОГАДЫВАЙСЯ: это поле уходит в
  карточку как факт разговора.
- nextStep.set — договорились ли о КОНКРЕТНОМ шаге («клиент подумает» — не шаг);
  description — что и когда; date — YYYY-MM-DD или null; time — время
  контакта («11:00», «после обеда») или null; goal — цель контакта («узнать
  решение», «показать директору») или null; clientAction — что клиент делает
  до контакта, managerAction — что делает менеджер; не прозвучало — null.
  Полный шаг — дата, время, цель и действия обеих сторон.
- productive — состоялся ли контакт и есть ли продвижение по сделке.
- dealProgress — ПРОДВИЖЕНИЕ СДЕЛКИ по этому звонку, шкала 1–5: 1 — ничего не
  изменилось («снова подумать», причина не выявлена, обязательств нет);
  2 — новая информация, но неопределённость (мнение получено, ЛПР определён,
  общий барьер, назначен контакт); 3 — конкретный барьер и действие по его
  снятию (ЛПР и критерии известны, клиент подтвердил ценность, шаг ведёт к
  решению); 4 — принципиальное согласие (комплект, цена, срок в целом
  согласованы, осталось оформление); 5 — закрыто (счёт, дата оплаты,
  возражений нет). Правила: активность менеджера ≠ результат; новый звонок
  ≠ продвижение; обязательство клиента сильнее обязательства менеджера;
  интерес («удобно», «понравилось») ≠ намерение купить; «пришлите счёт,
  покажу директору» — не выше 3; объективные ограничения (бюджетный
  процесс, закупка) оценку не снижают, если коммерческое решение принято.
  Поля: before — состояние до звонка, after — после, why — почему такая
  оценка, whyNotHigher — почему не выше. Применимо к доработке, решению,
  оплате и презентации, дошедшей до условий; для холодного, звонка под
  показ, заявки с сайта, приглашения на мероприятие и нерелевантного — null.
${withChecklists ? `${CLOSING_CHECKLISTS_SPEC}\n` : ''}- flow — черновик отчёта менеджера: resultStatus result/noresult/expired;
  noresultReasonCode только при noresult (secretar/nopickup/nonumber/busy/
  noresult_notime/nocontact/giveup/bay/wrong/auto), иначе null; plan.isPlanned —
  будет ли следующий контакт; plan.typeCode при isPlanned (cold/warm/
  presentation/hot/moneyAwait/supply), иначе null; plan.name — короткое название;
  plan.deadlineDate — YYYY-MM-DD или null.

${CLOSING_FACTS_SPEC}`;

export const FOCUS_CLOSING_PROMPT = focusClosingPrompt(true);
