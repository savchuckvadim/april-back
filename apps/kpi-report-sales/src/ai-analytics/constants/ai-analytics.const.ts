/**
 * Константы feature-модуля ai-analytics (AI-аналитика ОП, Фаза 1a плана
 * ai/tasks/ai-sales-analytics-plan.md): тег Swagger, префикс роутов,
 * ключи/TTL кэша, WS-события, runtime-массивы union-литералов для DTO
 * (@IsIn + Swagger enum). Магических строк в остальном коде модуля нет
 * (ai/rules/pbx-typing.md).
 */
import { CALL_REPORT_RISK_FLAG_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import {
    AI_ANALYTICS_SNAPSHOT_APP,
    AI_ANALYTICS_SNAPSHOT_PROVIDER,
    PULSE_DEFAULTS,
} from '@lib/sales-ai-analytics';

export const AI_ANALYTICS_SWAGGER_TAG = 'Sales AI Analytics' as const;
export const AI_ANALYTICS_ROUTE_PREFIX = 'ai-analytics' as const;

/** Префикс ключей кэша (app в AppCache). Смена версии инвалидирует всё. */
export const AI_ANALYTICS_CACHE_PREFIX = 'sales-ai-analytics:v1' as const;

/** TTL, секунды: настройки/готовность, пульс, периметр requester'а. */
export const AI_ANALYTICS_SETTINGS_TTL_SECONDS = 300;
export const AI_ANALYTICS_PULSE_TTL_SECONDS = 3600;
export const AI_ANALYTICS_ACCESS_TTL_SECONDS = 300;
/** Нижняя граница TTL повестки (до следующего понедельника, но не меньше). */
export const AI_ANALYTICS_AGENDA_MIN_TTL_SECONDS = 60;

/** Сегменты ключей кэша (между prefix/domain и деталями). */
export const AI_ANALYTICS_CACHE_SECTIONS = {
    SETTINGS: 'settings',
    PULSE: 'pulse',
    AGENDA: 'agenda',
    ACCESS: 'access',
    /** Обзор менеджер × тип за период (Фаза 1b, очередь + WS). */
    OVERVIEW: 'overview',
    /** Резерв под кэш «Внимания» (сейчас считается синхронно над overview). */
    ATTENTION: 'attention',
    /** Ростер ОП и его раскладка по отделам/группам (managers:org). */
    MANAGERS: 'managers',
    // --- Фаза 2 (план §3.4). TTL: model закрытых месяцев — 30 дней,
    // plan — 180 с, brief — 6 ч, error-конверт — 120 с.
    /** Портальная модель месяца: нормы μ, κ, φ, S_ref, потолки, готовность. */
    MODEL: 'model',
    /** План дня менеджера (обратная задача от цели). */
    PLAN: 'plan',
    /** AI-резюме дня/недели по ключу пакета фактов. */
    BRIEF: 'brief',
    /** Счётчик вызовов LLM на менеджера в день (квота brief). */
    BRIEF_QUOTA: 'brief-quota',
    /** История стадий сделок (crm.stagehistory) — эпизоды воронки. */
    STAGE_HISTORY: 'stage-history',
    /** Производственный календарь портала (calendar.settings.get). */
    CALENDAR: 'calendar',
} as const;

export const AI_ANALYTICS_WS_EVENTS = {
    OVERVIEW_DONE: 'ai-analytics:overview:done',
    OVERVIEW_ERROR: 'ai-analytics:overview:error',
    BRIEF_DONE: 'ai-analytics:brief:done',
    BRIEF_ERROR: 'ai-analytics:brief:error',
    DOSSIER_DONE: 'ai-analytics:dossier:done',
    DOSSIER_ERROR: 'ai-analytics:dossier:error',
} as const;

/** Статусы конверта ответа (план, 6.2). */
export const AI_ANALYTICS_RESPONSE_STATUSES = [
    'ready',
    'queued',
    'processing',
    'error',
] as const;
export type AiAnalyticsResponseStatus =
    (typeof AI_ANALYTICS_RESPONSE_STATUSES)[number];

export const AI_ANALYTICS_CACHE_SCOPES = [
    'all',
    'pulse',
    'agenda',
    'settings',
    'overview',
    'attention',
    'kpi-month',
    'plans',
    // Фаза 2: секции модели, плана дня, резюме и тяжёлых источников.
    'model',
    'plan',
    'brief',
    'brief-quota',
    'stage-history',
    'calendar',
] as const;
export type AiAnalyticsCacheScope = (typeof AI_ANALYTICS_CACHE_SCOPES)[number];

/**
 * Что сбрасывает `settings/save` (план §3.4): решение человека меняет
 * нормы, план и «Внимание», поэтому обзор, модель и план пересчитываются
 * заново. Кэш звонков и финансов не трогаем — исходные данные не менялись.
 */
export const AI_ANALYTICS_SETTINGS_RESET_SCOPES = [
    'overview',
    'attention',
    'model',
    'plan',
] as const satisfies readonly AiAnalyticsCacheScope[];

/** Роли requester'а по структуре продаж (план, 6.5). */
export const AI_ANALYTICS_REQUESTER_ROLES = [
    'cup',
    'op',
    'group',
    'manager',
] as const;
export type AiAnalyticsRequesterRole =
    (typeof AI_ANALYTICS_REQUESTER_ROLES)[number];
/** Руководители: видят периметр, читают список обратной связи. */
export const AI_ANALYTICS_LEADER_ROLES = ['cup', 'op', 'group'] as const;
/** Сброс кэша и сохранение настроек — только cup|op (план, 6.5). */
export const AI_ANALYTICS_ADMIN_ROLES = ['cup', 'op'] as const;
/**
 * Витрина только руководителям (решение владельца 07.09.2026, план §14.5
 * п. 4): менеджер без headOf при ai_analytics_self_view_enabled = false
 * получает 403 на читающих ручках с этим сообщением.
 */
export const AI_ANALYTICS_SELF_VIEW_FORBIDDEN_MESSAGE =
    'Витрина AI-аналитики доступна руководителям; включите ' +
    'ai_analytics_self_view_enabled, чтобы менеджеры видели свои данные';

/** Виды алерта пульса: риск-флаг разбора либо срочный приоритет коучинга. */
export const AI_ANALYTICS_ALERT_KINDS = [
    ...CALL_REPORT_RISK_FLAG_CODES,
    'urgent',
] as const;
export type AiAnalyticsAlertKind = (typeof AI_ANALYTICS_ALERT_KINDS)[number];
/** Приоритет коучинга, который сам по себе даёт алерт. */
export const AI_ANALYTICS_URGENT_COACHING = 'urgent' as const;

/** Режимы готовности витрины (план, 4.11). */
export const AI_ANALYTICS_READINESS_MODES = [
    'calibration',
    'descriptive',
    'norms',
    'hypothesis',
    'forecast',
    'recommendations',
    'kpi-only',
] as const;
export type AiAnalyticsReadinessMode =
    (typeof AI_ANALYTICS_READINESS_MODES)[number];

/** Пороги готовности (план, 4.11): calibration < 3 мес. или < 60 презентаций. */
export const AI_ANALYTICS_READINESS = {
    calibrationMonths: 3,
    calibrationPresentations: 60,
    normsPresentations: 100,
} as const;

/** Окна выборок, дни. */
export const AI_ANALYTICS_WINDOWS = {
    /** Есть ли разборы за последние N дней → pipelineEnabled. */
    pipelineLookbackDays: 30,
    /** Глубина выборки для готовности (месяцы истории, презентации). */
    readinessLookbackDays: 120,
    /** Рабочих дней истории пульса (дневной ряд XmR). */
    pulseHistoryWorkdays: PULSE_DEFAULTS.historyWorkdays,
} as const;

/** Объект реакции по умолчанию для конверта ai-analytics (object в ais). */
export const AI_ANALYTICS_FEEDBACK_OBJECTS = {
    PULSE: 'pulse',
    AGENDA: 'agenda',
    CALL_PREFIX: 'call:',
} as const;

// ---------------------------------------------------------------------------
// Push-контур (шаг 2 Фазы 1a): повестка РОПам и утренний разбор менеджерам
// ---------------------------------------------------------------------------

/**
 * Виды push-рассылки: повестка недели (пн), утренний разбор каждому
 * менеджеру и сводный дайджест по всем менеджерам адресатам из
 * ai_analytics_digest_all_user_ids (оба — ежедневно в 08:00).
 */
export const AI_ANALYTICS_PUSH_KINDS = [
    'agenda',
    'digest',
    'digest_all',
] as const;
export type AiAnalyticsPushKind = (typeof AI_ANALYTICS_PUSH_KINDS)[number];
/** Виды, которые ставит утренний тик крона (08:00 МСК). */
export const AI_ANALYTICS_MORNING_PUSH_KINDS = [
    'digest',
    'digest_all',
] as const satisfies readonly AiAnalyticsPushKind[];

/**
 * Расписания крона в UTC (контейнер живёт в UTC, как остальные кроны):
 * повестка — понедельник 08:30 МСК, дайджест — ежедневно 08:00 МСК.
 */
export const AI_ANALYTICS_PUSH_CRON = {
    AGENDA: '30 5 * * 1',
    DIGEST: '0 5 * * *',
} as const;

/** Префикс jobId push-джобы: ai-analytics:push:{kind}:{domain}:{date}. */
export const AI_ANALYTICS_PUSH_JOB_ID_PREFIX = 'ai-analytics:push' as const;

/** Итог попытки рассылки (для ответа ручки, логов и тестов). */
export const AI_ANALYTICS_PUSH_STATUSES = [
    'sent',
    'skipped',
    'failed',
] as const;
export type AiAnalyticsPushStatus = (typeof AI_ANALYTICS_PUSH_STATUSES)[number];

/** Причины, по которым рассылка не состоялась. */
export const AI_ANALYTICS_PUSH_REASONS = {
    DISABLED: 'disabled',
    DIGEST_DISABLED: 'digest-disabled',
    NO_RECIPIENTS: 'no-recipients',
    ALREADY_SENT: 'already-sent',
    EMPTY: 'empty',
    NOT_WORKDAY: 'not-workday',
    NOT_DELIVERED: 'not-delivered',
} as const;
export type AiAnalyticsPushReason =
    (typeof AI_ANALYTICS_PUSH_REASONS)[keyof typeof AI_ANALYTICS_PUSH_REASONS];

/**
 * Префиксы object ais-записей доставки (контракт 4): agenda_sent —
 * 'agenda:{weekKey}', digest_sent — 'digest:{day}' (+ managerId) для
 * личного дайджеста и 'digest_all:{day}' (managerId = null) для сводного.
 */
export const AI_ANALYTICS_PUSH_OBJECTS = {
    AGENDA_PREFIX: 'agenda:',
    DIGEST_PREFIX: 'digest:',
    DIGEST_ALL_PREFIX: 'digest_all:',
} as const;

/** Сводный дайджест: не больше стольких звонков на менеджера. */
export const AI_ANALYTICS_DIGEST_ALL_CALLS_PER_MANAGER = 3;

/** TAG уведомлений Bitrix: повтор с тем же TAG замещает, а не дублирует. */
export const AI_ANALYTICS_NOTIFY_TAG_PREFIX = 'ai-analytics' as const;

/** Цитата в тексте уведомления обрезается до этой длины. */
export const AI_ANALYTICS_PUSH_QUOTE_MAX_LENGTH = 300;

// ---------------------------------------------------------------------------
// Снапшоты (Фаза 0 → ais): месячный аудит данных по крону
// ---------------------------------------------------------------------------

/**
 * Виды снапшот-джоб SALES_AI_ANALYTICS_SNAPSHOT (план §5.3): месячный
 * аудит данных Фазы 0 плюс ритмы ночного конвейера Фазы 2. Новых значений
 * `JobNames` не заводим — вид и ритм едут в payload джобы.
 */
export const AI_ANALYTICS_SNAPSHOT_KINDS = [
    'audit',
    'nightly',
    'weekly',
    'monthly',
    'backfill',
] as const;
export type AiAnalyticsSnapshotKind =
    (typeof AI_ANALYTICS_SNAPSHOT_KINDS)[number];

/**
 * Тип и адресация ais-записи аудита сохранений настроек (план §3.1,
 * `ai-analytics-settings-audit`): каждое `settings/save` пишет снапшот с
 * автором, списком изменений и границей сравнимой истории до и после.
 * Ключ записи — день сохранения в TZ портала.
 */
export const AI_ANALYTICS_SETTINGS_AUDIT_RECORD = {
    TYPE: 'ai-analytics-settings-audit',
    APP: AI_ANALYTICS_SNAPSHOT_APP,
    PROVIDER: AI_ANALYTICS_SNAPSHOT_PROVIDER,
} as const;

/** Крон аудита в UTC: 1-е число 04:10 МСК (после ночных KPI-пересчётов). */
export const AI_ANALYTICS_AUDIT_CRON = '10 1 1 * *' as const;

/** Префикс jobId снапшот-джобы: ai-analytics:snapshot:{kind}:{domain}:{YYYY-MM}. */
export const AI_ANALYTICS_SNAPSHOT_JOB_ID_PREFIX =
    'ai-analytics:snapshot' as const;

/** Окно месячного аудита по крону (как у CLI по умолчанию). */
export const AI_ANALYTICS_AUDIT_SNAPSHOT_MONTHS = 6;
