export * from './sales-ai-analytics.module';

export * from './model/thresholds.const';
export * from './model/wilson';
export * from './model/metric';
export * from './model/xmr';
export * from './model/workdays.util';
export * from './model/sections.util';
export * from './model/pulse';
export * from './model/agenda';
export * from './model/morning-digest';

export * from './contracts/versions.types';
export * from './contracts/feedback.types';
export * from './contracts/snapshot.types';
export * from './contracts/audit-snapshot.types';

// Аудит данных (Фаза 0): оркестратор, Prisma-адаптер, типы отчёта и
// календарь окна. Разбор CLI-аргументов и расчёты — по глубоким путям
// (audit/ai-analytics-audit.cli и т.д.), приложениям они не нужны.
export * from './audit/ai-analytics-audit.run';
export * from './audit/ai-analytics-audit.db';
export * from './audit/ai-analytics-audit.time';
export type {
    AuditDb,
    AuditAiDepth,
    AuditAiRow,
    AuditTranscriptionRow,
} from './audit/ai-analytics-audit.load';
export type {
    AuditReport,
    AuditReportMeta,
} from './audit/ai-analytics-audit.report';
export {
    AI_ANALYTICS_AUDIT_ABOUT,
    renderAuditAboutMarkdown,
    renderAuditAboutSummary,
} from './audit/ai-analytics-audit.about';
export type {
    AiAnalyticsAuditAbout,
    AiAnalyticsAuditAboutItem,
    AiAnalyticsAuditAboutSection,
} from './audit/ai-analytics-audit.about';

// Nest-слой аудита: сервисный модуль (стор снапшотов + сервис) и админ-модуль
// (только для apps/admin). Сервисы — через модули, не напрямую.
export { SalesAiAnalyticsAuditModule } from './admin/sales-ai-analytics-audit.module';
export { SalesAiAnalyticsAdminModule } from './admin/sales-ai-analytics-admin.module';
export type {
    AiAnalyticsAuditPortalStatus,
    AiAnalyticsAuditResult,
    AiAnalyticsAuditRunOptions,
} from './admin/ai-analytics-audit.service';
export type {
    AiAnalyticsAuditSnapshotInput,
    AiAnalyticsAuditSnapshotRecord,
} from './admin/ai-analytics-audit-snapshot.store';
