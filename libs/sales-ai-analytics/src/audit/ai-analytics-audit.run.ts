/**
 * Оркестратор аудита данных AI-аналитики (Фаза 0 плана
 * ai/tasks/ai-sales-analytics-plan.md): окно месяцев → выборка из БД
 * (AuditDb) → модель отчёта → markdown. Общий код для CLI-входа
 * (apps/kpi-report-sales …/audit/run-ai-analytics-audit.ts), админ-ручки
 * (SalesAiAnalyticsAdminModule) и месячного снапшота по крону. Без Nest и
 * без прямого Prisma: источник данных приходит адаптером.
 */
import { AuditDb, loadAuditDataset } from './ai-analytics-audit.load';
import { renderAuditMarkdown } from './ai-analytics-audit.markdown';
import { AUDIT_RULES, AuditRules } from './ai-analytics-audit.recommend';
import { AuditReport, buildAuditReport } from './ai-analytics-audit.report';
import { dateKeyOf, monthWindow } from './ai-analytics-audit.time';

export interface RunAuditOptions {
    domain: string;
    /** Сколько последних календарных месяцев (текущий включительно). */
    months: number;
    timeZone: string;
    /** Момент запуска: от него считаются окно и дата отчёта. */
    now: Date;
    /**
     * Порог «короткого» звонка портала, с (решение владельца А.1): минимум
     * по карте `min_duration_sec_by_type` — тот же источник, что у пульса и
     * ночного конвейера (`resolveMinDurationByType` +
     * `minDurationFloorSec`). Не задан — дефолт правил аудита (300 с).
     */
    shortCallSec?: number;
}

/**
 * Правила аудита с порогом портала: аудит Фазы 0 обязан считать «короткий»
 * тем же порогом, которым конвейер отбирает звонки в разбор, иначе доля
 * коротких в отчёте описывает не ту выборку (находка M12).
 */
export function auditRulesWith(shortCallSec?: number): AuditRules {
    return shortCallSec === undefined
        ? AUDIT_RULES
        : { ...AUDIT_RULES, shortCallSec };
}

export interface RunAuditResult {
    report: AuditReport;
    markdown: string;
    /** Момент формирования, ISO (UTC). В report.meta — дата YYYY-MM-DD в TZ. */
    generatedAt: string;
}

export async function runAiAnalyticsAudit(
    db: AuditDb,
    options: RunAuditOptions,
): Promise<RunAuditResult> {
    const { domain, timeZone, now } = options;
    const months = monthWindow(now, options.months, timeZone);
    const dataset = await loadAuditDataset(db, { domain, months, timeZone });
    const report = buildAuditReport(
        dataset,
        {
            domain,
            timeZone,
            months,
            generatedAt: dateKeyOf(now, timeZone),
        },
        auditRulesWith(options.shortCallSec),
    );
    return {
        report,
        markdown: renderAuditMarkdown(report),
        generatedAt: now.toISOString(),
    };
}
