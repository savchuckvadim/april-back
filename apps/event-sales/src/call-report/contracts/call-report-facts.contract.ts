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
 * Подсхемы подключаются к фокусам «форма» (selfIntro), «возражения и цена»
 * (тема возражения, сбои, цены) и «закрытие и следующий шаг» (исход, вид и
 * время шага, допродажа) и к цельному разбору целиком.
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

/**
 * Секунда звонка по меткам [mm:ss] расшифровки (focus-v3.2, 16.11.2026):
 * по ней страница разбора подсвечивает место и ставит запись. null — меток
 * нет или место не определить.
 */
export const MOMENT_SEC_SCHEMA = { type: ['number', 'null'] } as const;

export const ISSUES_SCHEMA = {
    type: 'array',
    items: {
        type: 'object',
        properties: {
            code: { type: 'string', enum: [...CALL_REPORT_ISSUE_CODES] },
            quote: { type: 'string' },
            note: { type: ['string', 'null'] },
            startSec: MOMENT_SEC_SCHEMA,
            endSec: MOMENT_SEC_SCHEMA,
        },
        required: ['code', 'quote', 'note', 'startSec', 'endSec'],
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
            startSec: MOMENT_SEC_SCHEMA,
        },
        required: [
            'amount',
            'periodMonths',
            'product',
            'kind',
            'quote',
            'startSec',
        ],
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

/**
 * Поля цельного разбора и догона признаков: имя → подсхема. Фокус-разбор
 * (focus-v3.3) делит их между двумя проходами — «возражения и цена»
 * (OBJECTIONS_PRICE_FACTS_*) и «закрытие и следующий шаг» (CLOSING_FACTS_*).
 */
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

/** Поля прохода «возражения и цена»: сбои и прозвучавшие цены. */
export const OBJECTIONS_PRICE_FACTS_PROPERTIES = {
    issues: ISSUES_SCHEMA,
    prices: PRICES_SCHEMA,
} as const;
export const OBJECTIONS_PRICE_FACTS_REQUIRED = ['issues', 'prices'] as const;

/** Поля прохода «закрытие и следующий шаг»: исход разговора и допродажа. */
export const CLOSING_FACTS_PROPERTIES = {
    outcome: OUTCOME_SCHEMA,
    upsell: UPSELL_SCHEMA,
} as const;
export const CLOSING_FACTS_REQUIRED = ['outcome', 'upsell'] as const;

/**
 * Поля фокуса «содержание продажи» и цельного разбора (focus-v3.2): когда
 * в звонке началось выяснение потребностей и когда — презентация.
 */
export const CONTENT_MOMENTS_PROPERTIES = {
    needsStartSec: MOMENT_SEC_SCHEMA,
    presentationStartSec: MOMENT_SEC_SCHEMA,
} as const;
export const CONTENT_MOMENTS_REQUIRED = [
    'needsStartSec',
    'presentationStartSec',
] as const;

export const CONTENT_MOMENTS_SPEC = `- needsStartSec — секунда звонка, с которой менеджер начал выяснять
  потребности клиента (первый вопрос о его задачах), по метке [mm:ss]
  расшифровки; потребности не выяснялись или меток нет — null.
- presentationStartSec — секунда начала презентации (показа или предметного
  рассказа под задачи клиента), по метке [mm:ss]; презентации не было или
  меток нет — null.`;

/** Поля фокуса «форма»: самопредставление. */
export const FORM_FACTS_PROPERTIES = { selfIntro: SELF_INTRO_SCHEMA } as const;
export const FORM_FACTS_REQUIRED = ['selfIntro'] as const;

/**
 * Описания фактов для промптов. Один текст на факт: из них собираются и
 * прежний MOVEMENT_FACTS_SPEC (цельный разбор, догон признаков — байт в байт
 * как до деления), и два текста фокус-проходов focus-v3.3.
 */
const FACTS_SPEC_HEADER = `ФАКТЫ ДЛЯ ОТЧЁТА РУКОВОДИТЕЛЮ. Они складываются по всем звонкам месяца,
поэтому ставь строго по тому, что прозвучало; сомневаешься между двумя
вариантами — выбирай более слабый для менеджера.`;

const OUTCOME_FACT_SPEC = `- outcome — исход разговора, один код: advanced — договорились о показе
  системы, тестовом доступе, КП или счёте (шаг, который двигает сделку);
  callback_dated — договорились перезвонить и названа дата или день
  («в среду», «15-го»); postponed — «подумаем», «после 20-го», «на следующей
  неделе», «пришлите на почту» без договорённости о звонке с датой; refused —
  клиент отказал, прямо или мягко («не интересно», «не звоните»); no_contact —
  до того, кто решает, не дошли: секретарь не соединил, автоответчик, обрыв,
  ошиблись номером, разговор не состоялся. Нерелевантный звонок — null.`;

const NEXT_STEP_KIND_FACT_SPEC = `- nextStep.kind — вид следующего шага при nextStep.set = true: presentation —
  показ системы, demo_access — тестовый доступ, offer — КП, invoice — счёт,
  callback — созвон без нового материала, other — иное. nextStep.set = false —
  null.`;

const NEXT_STEP_START_FACT_SPEC = `- nextStep.startSec — секунда звонка, когда договорились о следующем шаге,
  по метке [mm:ss] расшифровки; шаг не назначен или меток нет — null.`;

const OBJECTION_TOPIC_FACT_SPEC = `- objections[].topic — тема возражения для отчёта, рядом с category:
  no_time — нет времени, отчётный период, «позвоните позже»;
  not_decision_maker — решает руководитель, «я не решаю»; budget_procurement —
  нет бюджета, закупки, бюджетная организация, 44-ФЗ; has_competitor — уже
  есть КонсультантПлюс или другая система, другой поставщик того же бренда;
  send_to_email — «пришлите на почту» вместо разговора; think_over —
  «подумаем», «посоветуемся»; not_interested — не интересно без причины;
  tech_issue — доступ не открывается, письмо не дошло, лимит запросов;
  call_fatigue — раздражение частыми звонками («вы уже звонили», «сколько
  можно»); price — дорого; other — не подходит ни одна тема.`;

const ISSUES_FACT_SPEC = `- issues — сбои НЕ по вине этого разговора, каждый с дословной цитатой:
  crm_duplicate — клиенту уже звонил другой наш менеджер или он в работе у
  коллеги, а звоним как новому; crm_repeat_refused — клиент уже отказывал,
  а ему звонят снова с тем же предложением; crm_existing_client — он уже наш
  клиент (договор действует), а звоним как новому; wrong_contact — не тот номер, не та
  организация, человек уволился; telephony — обрыв, помехи, не дозвонились в
  договорённое время; demo_access — тестовый доступ истёк или не работает,
  письмо с доступом не дошло, исчерпан лимит; promise_broken — обещанное в
  прошлый раз (КП, счёт, показ, звонок) не сделано; brand_competition —
  клиент получает предложения того же бренда от другого поставщика. note —
  одна фраза, что именно произошло, или null. startSec / endSec — секунды
  начала и конца цитаты по меткам [mm:ss] расшифровки; меток нет — null.
  Сбоев нет — пустой массив.`;

const PRICES_FACT_SPEC = `- prices — все цены, которые прозвучали, по одной записи на цену: amount —
  сумма в рублях числом; periodMonths — за сколько месяцев (12 — год, 3 —
  квартал, 1 — месяц; срок не назван — null); product — за что (комплект,
  доступ, название продукта) или null; kind — list (обычная цена) или promo
  (со скидкой, по акции, «в подарок»); quote — фраза, где цена прозвучала;
  startSec — секунда, когда она прозвучала, по метке [mm:ss]; меток нет —
  null. Цен не было — пустой массив.`;

const UPSELL_FACT_SPEC = `- upsell — предлагал ли менеджер больше, чем просил клиент: attempted
  true/false; kind — bundle (комплект, больше продуктов), period (срок
  длиннее), seats (больше доступов или рабочих мест), other; what — что
  именно, словами. Не предлагал — kind и what null.`;

const joinSpec = (parts: readonly string[]): string => parts.join('\n');

/** Все факты разом — цельный разбор и догон признаков. */
export const MOVEMENT_FACTS_SPEC = joinSpec([
    FACTS_SPEC_HEADER,
    OUTCOME_FACT_SPEC,
    NEXT_STEP_KIND_FACT_SPEC,
    NEXT_STEP_START_FACT_SPEC,
    OBJECTION_TOPIC_FACT_SPEC,
    ISSUES_FACT_SPEC,
    PRICES_FACT_SPEC,
    UPSELL_FACT_SPEC,
]);

/** Факты прохода «возражения и цена»: тема возражения, сбои, цены. */
export const OBJECTIONS_PRICE_FACTS_SPEC = joinSpec([
    FACTS_SPEC_HEADER,
    OBJECTION_TOPIC_FACT_SPEC,
    ISSUES_FACT_SPEC,
    PRICES_FACT_SPEC,
]);

/** Факты прохода «закрытие и следующий шаг»: исход, вид и время шага, допродажа. */
export const CLOSING_FACTS_SPEC = joinSpec([
    FACTS_SPEC_HEADER,
    OUTCOME_FACT_SPEC,
    NEXT_STEP_KIND_FACT_SPEC,
    NEXT_STEP_START_FACT_SPEC,
    UPSELL_FACT_SPEC,
]);

export const FORM_FACTS_SPEC = `- selfIntro — как менеджер вошёл в разговор: introduced — назвал себя по
  имени; companyNamed — назвал компанию (наше название из материалов или
  бренд); offerQuestion — если собеседник спросил «вы что-то предлагаете /
  продаёте?»: honest — ответил прямо, evasive — ушёл от ответа («ничего не
  предлагаем», «не подлежит рассылке», «просто уточнить»), none — такого
  вопроса не было.`;
