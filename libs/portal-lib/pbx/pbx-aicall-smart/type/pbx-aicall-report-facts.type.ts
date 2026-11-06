import type { CallReportSmartEnumItem } from './pbx-aicall-smart.type';

/**
 * Справочники фактов разбора для отчётов руководителю и собственнику
 * (постановка ai/tasks/2026-11-06-owner-period-report.md, §3): исход
 * разговора, вид следующего шага, тема возражения, сбои не по вине
 * разговора, цены, допродажа, самопредставление.
 *
 * В поля смарта «AI-анализ звонков» эти факты НЕ пишутся (лимит строки
 * смарта, навык bitrix-field-limits) — живут в `user_result` разбора и в
 * лёгкой проекции `AnalyticsCallLiteRow.report`. Русские подписи ITEMS —
 * для текстов отчётов и витрины.
 */

/** Исход разговора: что в итоге произошло со сделкой по этому звонку. */
export const CALL_REPORT_OUTCOME_CODES = [
    'advanced',
    'callback_dated',
    'postponed',
    'refused',
    'no_contact',
] as const;
export type CallReportOutcomeCode = (typeof CALL_REPORT_OUTCOME_CODES)[number];
export const CALL_REPORT_OUTCOME_ITEMS = [
    {
        CODE: 'advanced',
        VALUE: 'Продвинут: показ, доступ, КП или счёт',
        SORT: 100,
    },
    { CODE: 'callback_dated', VALUE: 'Перезвон с датой', SORT: 200 },
    { CODE: 'postponed', VALUE: 'Отложено без даты', SORT: 300 },
    { CODE: 'refused', VALUE: 'Отказ', SORT: 400 },
    { CODE: 'no_contact', VALUE: 'Без содержательного контакта', SORT: 500 },
] as const satisfies readonly (CallReportSmartEnumItem & {
    CODE: CallReportOutcomeCode;
})[];

/** Вид следующего шага при nextStep.set = true. */
export const CALL_REPORT_NEXT_STEP_KINDS = [
    'presentation',
    'demo_access',
    'offer',
    'invoice',
    'callback',
    'other',
] as const;
export type CallReportNextStepKind =
    (typeof CALL_REPORT_NEXT_STEP_KINDS)[number];
export const CALL_REPORT_NEXT_STEP_KIND_ITEMS = [
    { CODE: 'presentation', VALUE: 'Показ системы', SORT: 100 },
    { CODE: 'demo_access', VALUE: 'Тестовый доступ', SORT: 200 },
    { CODE: 'offer', VALUE: 'Коммерческое предложение', SORT: 300 },
    { CODE: 'invoice', VALUE: 'Счёт', SORT: 400 },
    { CODE: 'callback', VALUE: 'Созвон', SORT: 500 },
    { CODE: 'other', VALUE: 'Другое', SORT: 600 },
] as const satisfies readonly (CallReportSmartEnumItem & {
    CODE: CallReportNextStepKind;
})[];

/**
 * Тема возражения для отчёта — подробнее категории `CALL_REPORT_OBJECTION_CODES`
 * (та остаётся для смарта и истории рядов). Одно возражение несёт и
 * категорию, и тему.
 */
export const CALL_REPORT_OBJECTION_TOPICS = [
    'no_time',
    'not_decision_maker',
    'budget_procurement',
    'has_competitor',
    'send_to_email',
    'think_over',
    'not_interested',
    'tech_issue',
    'call_fatigue',
    'price',
    'other',
] as const;
export type CallReportObjectionTopic =
    (typeof CALL_REPORT_OBJECTION_TOPICS)[number];
export const CALL_REPORT_OBJECTION_TOPIC_ITEMS = [
    { CODE: 'no_time', VALUE: 'Нет времени, отчётный период', SORT: 100 },
    {
        CODE: 'not_decision_maker',
        VALUE: 'Не ЛПР, решает руководитель',
        SORT: 200,
    },
    { CODE: 'budget_procurement', VALUE: 'Нет бюджета, закупки', SORT: 300 },
    { CODE: 'has_competitor', VALUE: 'Уже есть другая система', SORT: 400 },
    { CODE: 'send_to_email', VALUE: '«Пришлите на почту»', SORT: 500 },
    { CODE: 'think_over', VALUE: 'Подумать, посоветоваться', SORT: 600 },
    { CODE: 'not_interested', VALUE: 'Не интересно', SORT: 700 },
    { CODE: 'tech_issue', VALUE: 'Технические проблемы', SORT: 800 },
    { CODE: 'call_fatigue', VALUE: 'Раздражение частыми звонками', SORT: 900 },
    { CODE: 'price', VALUE: 'Цена', SORT: 1000 },
    { CODE: 'other', VALUE: 'Другое', SORT: 1100 },
] as const satisfies readonly (CallReportSmartEnumItem & {
    CODE: CallReportObjectionTopic;
})[];

/** Сбой не по вине разговора: данные, связь, демо-доступ, обещания, бренд. */
export const CALL_REPORT_ISSUE_CODES = [
    'crm_duplicate',
    'wrong_contact',
    'telephony',
    'demo_access',
    'promise_broken',
    'brand_competition',
] as const;
export type CallReportIssueCode = (typeof CALL_REPORT_ISSUE_CODES)[number];
export const CALL_REPORT_ISSUE_ITEMS = [
    {
        CODE: 'crm_duplicate',
        VALUE: 'Дубль в CRM: уже звонили, уже клиент, уже отказал',
        SORT: 100,
    },
    { CODE: 'wrong_contact', VALUE: 'Неверный контакт', SORT: 200 },
    { CODE: 'telephony', VALUE: 'Телефония и связь', SORT: 300 },
    { CODE: 'demo_access', VALUE: 'Демо-доступ не работает', SORT: 400 },
    { CODE: 'promise_broken', VALUE: 'Обещанное не сделано', SORT: 500 },
    {
        CODE: 'brand_competition',
        VALUE: 'Другой дистрибьютор того же бренда',
        SORT: 600,
    },
] as const satisfies readonly (CallReportSmartEnumItem & {
    CODE: CallReportIssueCode;
})[];

/** Цена, как прозвучала: обычная или по акции. */
export const CALL_REPORT_PRICE_KINDS = ['list', 'promo'] as const;
export type CallReportPriceKind = (typeof CALL_REPORT_PRICE_KINDS)[number];

/** Что именно менеджер предложил сверх запроса клиента. */
export const CALL_REPORT_UPSELL_KINDS = [
    'bundle',
    'period',
    'seats',
    'other',
] as const;
export type CallReportUpsellKind = (typeof CALL_REPORT_UPSELL_KINDS)[number];
export const CALL_REPORT_UPSELL_ITEMS = [
    { CODE: 'bundle', VALUE: 'Комплект: больше продуктов', SORT: 100 },
    { CODE: 'period', VALUE: 'Срок длиннее', SORT: 200 },
    { CODE: 'seats', VALUE: 'Больше доступов', SORT: 300 },
    { CODE: 'other', VALUE: 'Другое', SORT: 400 },
] as const satisfies readonly (CallReportSmartEnumItem & {
    CODE: CallReportUpsellKind;
})[];

/**
 * Ответ менеджера на вопрос собеседника «вы что-то предлагаете?»: вопроса
 * не было, ответил прямо, ушёл от ответа (репутационный риск у секретарей).
 */
export const CALL_REPORT_OFFER_QUESTION_CODES = [
    'none',
    'honest',
    'evasive',
] as const;
export type CallReportOfferQuestionCode =
    (typeof CALL_REPORT_OFFER_QUESTION_CODES)[number];
