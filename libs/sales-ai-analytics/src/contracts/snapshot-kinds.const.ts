/**
 * Реестр типов снапшотов AI-аналитики в таблице ais (план
 * ai/tasks/ai-sales-analytics-plan.md, 5.1–5.2, 14.2 п. 4; Фаза 2 §3.1):
 * provider = app = 'ai-analytics', model = calcVersion, activity_id = ключ
 * периода, user_id = менеджер, status = 'done' | 'superseded'. Здесь —
 * типы, статусы, зёрна и единицы ретенции; дескрипторы типов (зерно,
 * форма ключа, ретенция) — в `snapshot-descriptors.const.ts`, их читают
 * стор снапшотов и джоба ретенции (ai/rules/pbx-typing.md).
 */
import { AI_ANALYTICS_AUDIT_TYPE } from './audit-snapshot.types';
import {
    AI_ANALYTICS_FEEDBACK_APP,
    AI_ANALYTICS_FEEDBACK_PROVIDER,
    AI_ANALYTICS_FEEDBACK_TYPE,
} from './feedback.types';

/** provider/app всех ais-записей AI-аналитики (общие с контрактом 4). */
export const AI_ANALYTICS_SNAPSHOT_PROVIDER = AI_ANALYTICS_FEEDBACK_PROVIDER;
export const AI_ANALYTICS_SNAPSHOT_APP = AI_ANALYTICS_FEEDBACK_APP;

/**
 * Тип ais-записи настроек витрины. Канонический литерал — здесь;
 * AI_ANALYTICS_SETTINGS_RECORD.TYPE (apps/kpi-report-sales) ссылается
 * на эту константу, своего значения не держит.
 */
export const AI_ANALYTICS_SETTINGS_TYPE = 'ai-analytics-settings';

/**
 * Тип ais-записи аудита сохранений настроек (план §3.1): каждое
 * `settings/save` пишет запись с автором, списком изменений и границей
 * сравнимой истории до/после. Канонический литерал — здесь;
 * AI_ANALYTICS_SETTINGS_AUDIT_RECORD.TYPE приложения ссылается на реестр.
 */
export const AI_ANALYTICS_SETTINGS_AUDIT_TYPE = 'ai-analytics-settings-audit';

/**
 * Тип ais-записи подбора недели «три звонка руководителю» (план §3.1,
 * поток 15): ключ — ISO-неделя, запись портальная (менеджеры внутри).
 * Канонический литерал — здесь; AI_ROP_MARK_RECORD.TYPE приложения
 * ссылается на реестр.
 */
export const AI_ANALYTICS_ROP_MARK_TYPE = 'ai-analytics-rop-mark';

/**
 * Типы снапшотов по именам (значения — колонка type в ais).
 *
 * `plan` — тип потока 14a «снимок планов 1-го числа» (цели месяца по всем
 * менеджерам из UF_USR_A_SALES_PLAN_*, план 4.9): в таблице §3.1 плана
 * его нет, но он пишется PlansSnapshotUseCase и читается шагом финансов,
 * поэтому остаётся в реестре.
 */
export const AI_ANALYTICS_SNAPSHOT_TYPE = {
    managerWeek: 'ai-analytics-manager-week',
    managerMonth: 'ai-analytics-manager-month',
    portalModel: 'ai-analytics-portal-model',
    forecast: 'ai-analytics-forecast',
    brief: 'ai-analytics-brief',
    etlRun: 'ai-analytics-etl-run',
    style: 'ai-analytics-style',
    plan: 'ai-analytics-plan',
    settingsAudit: AI_ANALYTICS_SETTINGS_AUDIT_TYPE,
    ropMark: AI_ANALYTICS_ROP_MARK_TYPE,
    feedback: AI_ANALYTICS_FEEDBACK_TYPE,
    audit: AI_ANALYTICS_AUDIT_TYPE,
    settings: AI_ANALYTICS_SETTINGS_TYPE,
} as const;

/** Порядок — порядок таблицы §3.1 плана (снапшоты Фазы 2, затем 1a/0). */
export const AI_ANALYTICS_SNAPSHOT_TYPES = [
    AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek,
    AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
    AI_ANALYTICS_SNAPSHOT_TYPE.portalModel,
    AI_ANALYTICS_SNAPSHOT_TYPE.forecast,
    AI_ANALYTICS_SNAPSHOT_TYPE.brief,
    AI_ANALYTICS_SNAPSHOT_TYPE.etlRun,
    AI_ANALYTICS_SNAPSHOT_TYPE.style,
    AI_ANALYTICS_SNAPSHOT_TYPE.plan,
    AI_ANALYTICS_SNAPSHOT_TYPE.settingsAudit,
    AI_ANALYTICS_SNAPSHOT_TYPE.ropMark,
    AI_ANALYTICS_SNAPSHOT_TYPE.feedback,
    AI_ANALYTICS_SNAPSHOT_TYPE.audit,
    AI_ANALYTICS_SNAPSHOT_TYPE.settings,
] as const;

export type AiAnalyticsSnapshotType =
    (typeof AI_ANALYTICS_SNAPSHOT_TYPES)[number];

export function isAiAnalyticsSnapshotType(
    value: unknown,
): value is AiAnalyticsSnapshotType {
    return (
        typeof value === 'string' &&
        (AI_ANALYTICS_SNAPSHOT_TYPES as readonly string[]).includes(value)
    );
}

/** Статус ais-записи снапшота (план 5.1): актуальная либо замещённая. */
export const AI_ANALYTICS_SNAPSHOT_STATUS = {
    done: 'done',
    superseded: 'superseded',
} as const;

export const AI_ANALYTICS_SNAPSHOT_STATUSES = [
    AI_ANALYTICS_SNAPSHOT_STATUS.done,
    AI_ANALYTICS_SNAPSHOT_STATUS.superseded,
] as const;
export type AiAnalyticsSnapshotStatus =
    (typeof AI_ANALYTICS_SNAPSHOT_STATUSES)[number];

export function isAiAnalyticsSnapshotStatus(
    value: unknown,
): value is AiAnalyticsSnapshotStatus {
    return (
        typeof value === 'string' &&
        (AI_ANALYTICS_SNAPSHOT_STATUSES as readonly string[]).includes(value)
    );
}

/**
 * Зерно снапшота — субъект × шаг времени; задаёт форму ключа activity_id:
 * *-week → 'YYYY-Www', *-month → 'YYYY-MM', *-day → 'YYYY-MM-DD',
 * portal-hash → хэш входов.
 */
export const AI_ANALYTICS_SNAPSHOT_GRAINS = [
    'manager-week',
    'manager-month',
    'portal-week',
    'portal-month',
    'manager-day',
    'portal-day',
    'portal-hash',
] as const;
export type AiAnalyticsSnapshotGrain =
    (typeof AI_ANALYTICS_SNAPSHOT_GRAINS)[number];

/** Зёрна с субъектом-менеджером: managerId обязателен (колонка user_id). */
export const AI_ANALYTICS_MANAGER_GRAINS = [
    'manager-week',
    'manager-month',
    'manager-day',
] as const satisfies readonly AiAnalyticsSnapshotGrain[];

export function isManagerGrain(grain: AiAnalyticsSnapshotGrain): boolean {
    return (AI_ANALYTICS_MANAGER_GRAINS as readonly string[]).includes(grain);
}

/**
 * Единица ретенции: 'records' — сколько записей субъекта хранить,
 * 'days' — сколько дней от created_at, 'forever' — бессрочно.
 */
export const AI_ANALYTICS_SNAPSHOT_RETENTION_UNITS = [
    'records',
    'days',
    'forever',
] as const;
export type AiAnalyticsSnapshotRetentionUnit =
    (typeof AI_ANALYTICS_SNAPSHOT_RETENTION_UNITS)[number];

export interface AiAnalyticsSnapshotRetention {
    unit: AiAnalyticsSnapshotRetentionUnit;
    /** Число записей или дней; null при unit = 'forever'. */
    value: number | null;
}

export interface AiAnalyticsSnapshotDescriptor {
    type: AiAnalyticsSnapshotType;
    grain: AiAnalyticsSnapshotGrain;
    /** Описание ключа activity_id по-русски (форма и смысл). */
    keyFormat: string;
    retention: AiAnalyticsSnapshotRetention;
    description: string;
}

/**
 * Окно поиска по created_at, когда ключи периодов заранее неизвестны
 * (latest / prune): дальше в прошлое снапшоты не ищем.
 */
export const AI_ANALYTICS_SNAPSHOT_LOOKBACK_DAYS = 400;

/**
 * Верхняя граница строк выборки окном created_at (без ключей периодов,
 * план §3.2 «limit обязателен»): стор берёт не больше стольких самых
 * свежих записей типа. Столько же по умолчанию просматривают latest и
 * prune; шире — только явным limit вызывающего.
 */
export const AI_ANALYTICS_SNAPSHOT_WINDOW_LIMIT = 2000;

/** Статус шага ночного конвейера (нагрузка снапшота etl-run). */
export const AI_ANALYTICS_ETL_STEP_STATUSES = [
    'ok',
    'failed',
    'skipped',
] as const;
export type AiAnalyticsEtlStepStatus =
    (typeof AI_ANALYTICS_ETL_STEP_STATUSES)[number];
