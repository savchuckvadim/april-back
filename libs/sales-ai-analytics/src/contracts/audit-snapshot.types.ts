/**
 * Снапшот аудита данных AI-аналитики в таблице ais (без новых таблиц):
 * type/app/provider фиксированы, result — markdown отчёта, user_result —
 * AiAnalyticsAuditSnapshotPayload, domain — портал. Пишут админ-ручка
 * (source = admin) и месячный крон kpi-report-sales (source = cron);
 * читает GET admin/ai-analytics/audit/latest.
 */
import { AuditReport } from '../audit/ai-analytics-audit.report';

export const AI_ANALYTICS_AUDIT_TYPE = 'ai-analytics-audit';
export const AI_ANALYTICS_AUDIT_APP = 'ai-analytics';
export const AI_ANALYTICS_AUDIT_PROVIDER = 'ai-analytics';

/** Глубина поиска последнего снапшота (findByDomainTypesInPeriod по created_at). */
export const AI_ANALYTICS_AUDIT_LOOKBACK_DAYS = 400;

/** Кто сформировал снапшот: админ-ручка или месячный крон. */
export const AI_ANALYTICS_AUDIT_SOURCES = ['admin', 'cron'] as const;
export type AiAnalyticsAuditSource =
    (typeof AI_ANALYTICS_AUDIT_SOURCES)[number];

export function isAiAnalyticsAuditSource(
    value: unknown,
): value is AiAnalyticsAuditSource {
    return (
        typeof value === 'string' &&
        (AI_ANALYTICS_AUDIT_SOURCES as readonly string[]).includes(value)
    );
}

/** user_result записи ais типа ai-analytics-audit. */
export interface AiAnalyticsAuditSnapshotPayload {
    report: AuditReport;
    /** Сколько месяцев запрошено (окно — в report.meta.months). */
    months: number;
    timeZone: string;
    /** Момент формирования, ISO (UTC). */
    generatedAt: string;
    source: AiAnalyticsAuditSource;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Структурная проверка отчёта: meta с доменом и окном, totals, rules и
 * recommendation. Глубже не смотрим — отчёт пишет и читает один код lib.
 */
export function isAuditReportLike(value: unknown): value is AuditReport {
    if (!isRecord(value)) return false;
    const { meta, totals, rules, recommendation } = value;
    return (
        isRecord(meta) &&
        typeof meta.domain === 'string' &&
        typeof meta.timeZone === 'string' &&
        typeof meta.generatedAt === 'string' &&
        Array.isArray(meta.months) &&
        isRecord(totals) &&
        typeof totals.calls === 'number' &&
        isRecord(rules) &&
        isRecord(recommendation)
    );
}

/** user_result ais-записи → payload снапшота; чужая форма → null. */
export function parseAuditSnapshotPayload(
    userResult: unknown,
): AiAnalyticsAuditSnapshotPayload | null {
    if (!isRecord(userResult)) return null;
    const { report, months, timeZone, generatedAt, source } = userResult;
    if (
        !isAuditReportLike(report) ||
        typeof months !== 'number' ||
        !Number.isInteger(months) ||
        typeof timeZone !== 'string' ||
        typeof generatedAt !== 'string' ||
        !isAiAnalyticsAuditSource(source)
    ) {
        return null;
    }
    return { report, months, timeZone, generatedAt, source };
}
