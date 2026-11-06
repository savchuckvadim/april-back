import {
    CALL_REPORT_ISSUE_CODES,
    CALL_REPORT_NEXT_STEP_KINDS,
    CALL_REPORT_OBJECTION_TOPICS,
    CALL_REPORT_OFFER_QUESTION_CODES,
    CALL_REPORT_OUTCOME_CODES,
    CALL_REPORT_PRICE_KINDS,
    CALL_REPORT_UPSELL_KINDS,
} from '@lib/call-lib';

/**
 * Факты разбора для отчётов руководителю и собственнику (focus-v3.1,
 * 06.11.2026; постановка ai/tasks/2026-11-06-owner-period-report.md, §3):
 * исход разговора, вид следующего шага, тема возражения, сбои не по вине
 * разговора, прозвучавшие цены, допродажа, самопредставление.
 *
 * Правка МИНОРНАЯ: оценки разделов и рубрика не меняются, факты только
 * добавляются — ряд сравнимости не рвётся (запись в PROMPT_SERIES_START).
 * Подсхемы подключаются к фокусам «форма» (selfIntro) и «движение сделки»
 * (остальное) и к цельному разбору.
 */

export const OUTCOME_SCHEMA = {
    type: ['string', 'null'],
    enum: [...CALL_REPORT_OUTCOME_CODES, null],
} as const;

export const NEXT_STEP_KIND_SCHEMA = {
    type: ['string', 'null'],
    enum: [...CALL_REPORT_NEXT_STEP_KINDS, null],
} as const;

export const OBJECTION_TOPIC_SCHEMA = {
    type: ['string', 'null'],
    enum: [...CALL_REPORT_OBJECTION_TOPICS, null],
} as const;

export const ISSUES_SCHEMA = {
    type: 'array',
    items: {
        type: 'object',
        properties: {
            code: { type: 'string', enum: [...CALL_REPORT_ISSUE_CODES] },
            quote: { type: 'string' },
            note: { type: ['string', 'null'] },
        },
        required: ['code', 'quote', 'note'],
        additionalProperties: false,
    },
} as const;

export const PRICES_SCHEMA = {
    type: 'array',
    items: {
        type: 'object',
        properties: {
            amount: { type: 'number', minimum: 0 },
            periodMonths: { type: ['integer', 'null'], minimum: 1 },
            product: { type: ['string', 'null'] },
            kind: { type: 'string', enum: [...CALL_REPORT_PRICE_KINDS] },
            quote: { type: 'string' },
        },
        required: ['amount', 'periodMonths', 'product', 'kind', 'quote'],
        additionalProperties: false,
    },
} as const;

export const UPSELL_SCHEMA = {
    type: 'object',
    properties: {
        attempted: { type: 'boolean' },
        kind: {
            type: ['string', 'null'],
            enum: [...CALL_REPORT_UPSELL_KINDS, null],
        },
        what: { type: ['string', 'null'] },
    },
    required: ['attempted', 'kind', 'what'],
    additionalProperties: false,
} as const;

export const SELF_INTRO_SCHEMA = {
    type: 'object',
    properties: {
        introduced: { type: 'boolean' },
        companyNamed: { type: 'boolean' },
        offerQuestion: {
            type: 'string',
            enum: [...CALL_REPORT_OFFER_QUESTION_CODES],
        },
    },
    required: ['introduced', 'companyNamed', 'offerQuestion'],
    additionalProperties: false,
} as const;

/** Поля фокуса «движение сделки» и цельного разбора: имя → подсхема. */
export const MOVEMENT_FACTS_PROPERTIES = {
    outcome: OUTCOME_SCHEMA,
    issues: ISSUES_SCHEMA,
    prices: PRICES_SCHEMA,
    upsell: UPSELL_SCHEMA,
} as const;
export const MOVEMENT_FACTS_REQUIRED = [
    'outcome',
    'issues',
    'prices',
    'upsell',
] as const;

/** Поля фокуса «форма»: самопредставление. */
export const FORM_FACTS_PROPERTIES = { selfIntro: SELF_INTRO_SCHEMA } as const;
export const FORM_FACTS_REQUIRED = ['selfIntro'] as const;

export const MOVEMENT_FACTS_SPEC = `ФАКТЫ ДЛЯ ОТЧЁТА РУКОВОДИТЕЛЮ. Они складываются по всем звонкам месяца,
поэтому ставь строго по тому, что прозвучало; сомневаешься между двумя
вариантами — выбирай более слабый для менеджера.
- outcome — исход разговора, один код: advanced — договорились о показе
  системы, тестовом доступе, КП или счёте (шаг, который двигает сделку);
  callback_dated — договорились перезвонить и названа дата или день
  («в среду», «15-го»); postponed — «подумаем», «после 20-го», «на следующей
  неделе», «пришлите на почту» без договорённости о звонке с датой; refused —
  клиент отказал, прямо или мягко («не интересно», «не звоните»); no_contact —
  до того, кто решает, не дошли: секретарь не соединил, автоответчик, обрыв,
  ошиблись номером, разговор не состоялся. Нерелевантный звонок — null.
- nextStep.kind — вид следующего шага при nextStep.set = true: presentation —
  показ системы, demo_access — тестовый доступ, offer — КП, invoice — счёт,
  callback — созвон без нового материала, other — иное. nextStep.set = false —
  null.
- objections[].topic — тема возражения для отчёта, рядом с category:
  no_time — нет времени, отчётный период, «позвоните позже»;
  not_decision_maker — решает руководитель, «я не решаю»; budget_procurement —
  нет бюджета, закупки, бюджетная организация, 44-ФЗ; has_competitor — уже
  есть КонсультантПлюс или другая система, другой поставщик того же бренда;
  send_to_email — «пришлите на почту» вместо разговора; think_over —
  «подумаем», «посоветуемся»; not_interested — не интересно без причины;
  tech_issue — доступ не открывается, письмо не дошло, лимит запросов;
  call_fatigue — раздражение частыми звонками («вы уже звонили», «сколько
  можно»); price — дорого; other — не подходит ни одна тема.
- issues — сбои НЕ по вине этого разговора, каждый с дословной цитатой:
  crm_duplicate — клиенту уже звонили коллеги, он уже клиент или уже
  отказывал, а звоним как новому; wrong_contact — не тот номер, не та
  организация, человек уволился; telephony — обрыв, помехи, не дозвонились в
  договорённое время; demo_access — тестовый доступ истёк или не работает,
  письмо с доступом не дошло, исчерпан лимит; promise_broken — обещанное в
  прошлый раз (КП, счёт, показ, звонок) не сделано; brand_competition —
  клиент получает предложения того же бренда от другого поставщика. note —
  одна фраза, что именно произошло, или null. Сбоев нет — пустой массив.
- prices — все цены, которые прозвучали, по одной записи на цену: amount —
  сумма в рублях числом; periodMonths — за сколько месяцев (12 — год, 3 —
  квартал, 1 — месяц; срок не назван — null); product — за что (комплект,
  доступ, название продукта) или null; kind — list (обычная цена) или promo
  (со скидкой, по акции, «в подарок»); quote — фраза, где цена прозвучала.
  Цен не было — пустой массив.
- upsell — предлагал ли менеджер больше, чем просил клиент: attempted
  true/false; kind — bundle (комплект, больше продуктов), period (срок
  длиннее), seats (больше доступов или рабочих мест), other; what — что
  именно, словами. Не предлагал — kind и what null.`;

export const FORM_FACTS_SPEC = `- selfIntro — как менеджер вошёл в разговор: introduced — назвал себя по
  имени; companyNamed — назвал компанию (наше название из материалов или
  бренд); offerQuestion — если собеседник спросил «вы что-то предлагаете /
  продаёте?»: honest — ответил прямо, evasive — ушёл от ответа («ничего не
  предлагаем», «не подлежит рассылке», «просто уточнить»), none — такого
  вопроса не было.`;
