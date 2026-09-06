/**
 * Константы шага «overview» Фазы 1b (план ai/tasks/ai-sales-analytics-plan.md,
 * 6.2–6.5, 9 «Фаза 1b» п. 3): TTL кэша обзора, опции джобы, версии расчёта,
 * уровни менеджеров, форма воронки, рёбра воронки, раскладки by-type,
 * окно «Внимания», крон прогрева, ais-запись настроек. Runtime-массивы
 * union-литералов переиспользуются в @IsIn и Swagger enum
 * (ai/rules/dto-conventions.md, pbx-typing.md).
 */
import {
    CALL_REPORT_CALL_TYPE_CODES,
    CallReportCallTypeCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { AI_ANALYTICS_PULSE_TTL_SECONDS } from './ai-analytics.const';

/** Версия кода расчёта витрины (semver, план 4.11). */
export const AI_ANALYTICS_CALC_VERSION = 'sam-1.0.0' as const;

/** Период обзора не длиннее трёх месяцев (план 6.2). */
export const AI_ANALYTICS_OVERVIEW_MAX_MONTHS = 3;
/** Период обзора по умолчанию и окно прогрева — 4 недели (ТЗ FR-13). */
export const AI_ANALYTICS_OVERVIEW_DEFAULT_DAYS = 28;

/**
 * TTL кэша обзора, секунды: closed — период целиком в закрытых месяцах
 * (данные закрыты, как kpi-month); past — период закончился до сегодня
 * (разборы ещё могут доехать, как пульс — 1 ч); live — период включает
 * сегодня; error — конверт ошибки процессора.
 */
export const AI_ANALYTICS_OVERVIEW_TTL_SECONDS = {
    closed: 60 * 60 * 24 * 30,
    past: AI_ANALYTICS_PULSE_TTL_SECONDS,
    live: 180,
    error: 120,
} as const;

/** Опции Bull-джобы обзора (план 6.4): приоритет, без ретраев, таймаут 120 с. */
export const AI_ANALYTICS_OVERVIEW_JOB_OPTIONS = {
    priority: 1,
    attempts: 1,
    timeout: 120_000,
    removeOnComplete: true,
    removeOnFail: true,
} as const;

/** Состояния Bull-джобы, при которых повторный запрос получает processing. */
export const AI_ANALYTICS_JOB_RUNNING_STATES = [
    'waiting',
    'active',
    'delayed',
    'paused',
] as const;

/** Уровни менеджера (план 2.2); назначает РОП, дефолт — по стажу. */
export const AI_ANALYTICS_MANAGER_LEVELS = [
    'junior',
    'middle',
    'senior',
] as const;
export type AiAnalyticsManagerLevel =
    (typeof AI_ANALYTICS_MANAGER_LEVELS)[number];

export const AI_ANALYTICS_LEVEL_SOURCES = ['manual', 'default'] as const;
export type AiAnalyticsLevelSource =
    (typeof AI_ANALYTICS_LEVEL_SOURCES)[number];

/** Стаж короче — junior по умолчанию; без даты стажа — middle. */
export const AI_ANALYTICS_JUNIOR_TENURE_MONTHS = 6;
export const AI_ANALYTICS_DEFAULT_LEVEL: AiAnalyticsManagerLevel = 'middle';

/** Форма воронки менеджера по доле счетов без презентации (план 6.3). */
export const AI_ANALYTICS_FUNNEL_SHAPES = [
    'presenter',
    'closer',
    'balanced',
    'unknown',
] as const;
export type AiAnalyticsFunnelShape =
    (typeof AI_ANALYTICS_FUNNEL_SHAPES)[number];

/** Пороги формы воронки: считается при ≥ minInvoices счетов. */
export const AI_ANALYTICS_FUNNEL_SHAPE = {
    minInvoices: 20,
    /** Доля счетов без презентации ≥ порога → closer. */
    closerShare: 0.5,
    /** Доля счетов без презентации ≤ порога → presenter. */
    presenterShare: 0.2,
} as const;

/**
 * Рёбра воронки Фазы 1b — доли по KPI-фактам без усадки (planHead/норм
 * нет, priorSource = none). s/n — сделано / вошло по самоотчёту.
 */
export const AI_ANALYTICS_FUNNEL_EDGES = [
    {
        code: 'call_to_presentation',
        title: 'Звонок → презентация',
        from: 'call_done',
        to: 'presentation_uniq_done',
    },
    {
        code: 'presentation_to_offer',
        title: 'Презентация → КП',
        from: 'presentation_uniq_done',
        to: 'ev_offer_act_send',
    },
    {
        code: 'offer_to_invoice',
        title: 'КП → счёт',
        from: 'ev_offer_act_send',
        to: 'ev_invoice_act_send',
    },
    {
        code: 'invoice_to_sale',
        title: 'Счёт → продажа',
        from: 'ev_invoice_act_send',
        to: 'ev_success_done',
    },
] as const;
export type AiAnalyticsFunnelEdgeCode =
    (typeof AI_ANALYTICS_FUNNEL_EDGES)[number]['code'];
export const AI_ANALYTICS_FUNNEL_EDGE_CODES = AI_ANALYTICS_FUNNEL_EDGES.map(
    edge => edge.code,
) as readonly AiAnalyticsFunnelEdgeCode[];

/** Источник приора ребра: Фаза 1b — none; portal/pool — с Фазы 2. */
export const AI_ANALYTICS_PRIOR_SOURCES = ['none', 'portal', 'pool'] as const;
export type AiAnalyticsPriorSource =
    (typeof AI_ANALYTICS_PRIOR_SOURCES)[number];

/** Источник текста объяснения ячейки (ТЗ FR-23). */
export const AI_ANALYTICS_EXPLANATION_SOURCES = ['template', 'llm'] as const;
export type AiAnalyticsExplanationSource =
    (typeof AI_ANALYTICS_EXPLANATION_SOURCES)[number];

/** Раскладки среза by-type (ТЗ FR-21). */
export const AI_ANALYTICS_BY_TYPE_LAYOUTS = ['wide', 'long'] as const;
export type AiAnalyticsByTypeLayout =
    (typeof AI_ANALYTICS_BY_TYPE_LAYOUTS)[number];

/** Сквозной срез возражений — псевдотип в by-type. */
export const AI_ANALYTICS_BY_TYPE_OBJECTIONS = 'objections' as const;
/** Допустимые значения callType в by-type: типы справочника + objections. */
export const AI_ANALYTICS_BY_TYPE_CODES = [
    ...CALL_REPORT_CALL_TYPE_CODES,
    AI_ANALYTICS_BY_TYPE_OBJECTIONS,
] as const;
export type AiAnalyticsByTypeCode =
    | CallReportCallTypeCode
    | typeof AI_ANALYTICS_BY_TYPE_OBJECTIONS;

/** Вид показателя строки «длинной» раскладки. */
export const AI_ANALYTICS_BY_TYPE_INDICATOR_KINDS = [
    'score',
    'section',
    'checklist',
    'kpi',
    'objection',
] as const;
export type AiAnalyticsByTypeIndicatorKind =
    (typeof AI_ANALYTICS_BY_TYPE_INDICATOR_KINDS)[number];

/** Окно доли «шаг с датой» для сигнала next_step_drop: две недели (дней). */
export const AI_ANALYTICS_ATTENTION_WINDOW_DAYS = 14;

/** Крон прогрева обзора в UTC: ежедневно 05:30 МСК (после ночных KPI). */
export const AI_ANALYTICS_PREWARM_CRON = '30 2 * * *' as const;

/**
 * Ais-запись настроек витрины (временное решение Фазы 1b до ключей
 * ai_analytics_levels/targets/absences в схеме app-settings, план 5.1):
 * type/app/provider фиксированы, activity_id — ключ набора, последняя
 * запись на ключ — актуальная.
 */
export const AI_ANALYTICS_SETTINGS_RECORD = {
    TYPE: 'ai-analytics-settings',
    APP: 'ai-analytics',
    PROVIDER: 'ai-analytics',
    LEVELS_KEY: 'levels',
} as const;
