/**
 * Константы feature-модуля ai-analytics (AI-аналитика ОП, Фаза 1a плана
 * ai/tasks/ai-sales-analytics-plan.md): тег Swagger, префикс роутов,
 * ключи/TTL кэша, WS-события, runtime-массивы union-литералов для DTO
 * (@IsIn + Swagger enum). Магических строк в остальном коде модуля нет
 * (ai/rules/pbx-typing.md).
 */
import { CALL_REPORT_RISK_FLAG_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { PULSE_DEFAULTS } from '@lib/sales-ai-analytics';

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
] as const;
export type AiAnalyticsCacheScope = (typeof AI_ANALYTICS_CACHE_SCOPES)[number];

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

/** Виды push-рассылки: повестка недели (пн) и утренний разбор (ежедневно). */
export const AI_ANALYTICS_PUSH_KINDS = ['agenda', 'digest'] as const;
export type AiAnalyticsPushKind = (typeof AI_ANALYTICS_PUSH_KINDS)[number];

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
 * 'agenda:{weekKey}', digest_sent — 'digest:{day}' (+ managerId).
 */
export const AI_ANALYTICS_PUSH_OBJECTS = {
    AGENDA_PREFIX: 'agenda:',
    DIGEST_PREFIX: 'digest:',
} as const;

/** TAG уведомлений Bitrix: повтор с тем же TAG замещает, а не дублирует. */
export const AI_ANALYTICS_NOTIFY_TAG_PREFIX = 'ai-analytics' as const;

/** Цитата в тексте уведомления обрезается до этой длины. */
export const AI_ANALYTICS_PUSH_QUOTE_MAX_LENGTH = 300;

// ---------------------------------------------------------------------------
// Снапшоты (Фаза 0 → ais): месячный аудит данных по крону
// ---------------------------------------------------------------------------

/** Виды снапшот-джоб SALES_AI_ANALYTICS_SNAPSHOT; пока только аудит данных. */
export const AI_ANALYTICS_SNAPSHOT_KINDS = ['audit'] as const;
export type AiAnalyticsSnapshotKind =
    (typeof AI_ANALYTICS_SNAPSHOT_KINDS)[number];

/** Крон аудита в UTC: 1-е число 04:10 МСК (после ночных KPI-пересчётов). */
export const AI_ANALYTICS_AUDIT_CRON = '10 1 1 * *' as const;

/** Префикс jobId снапшот-джобы: ai-analytics:snapshot:{kind}:{domain}:{YYYY-MM}. */
export const AI_ANALYTICS_SNAPSHOT_JOB_ID_PREFIX =
    'ai-analytics:snapshot' as const;

/** Окно месячного аудита по крону (как у CLI по умолчанию). */
export const AI_ANALYTICS_AUDIT_SNAPSHOT_MONTHS = 6;
