import { AiAnalyticsSnapshotKind } from '../constants/ai-analytics.const';

/**
 * Payload Bull-джобы SALES_AI_ANALYTICS_SNAPSHOT (внутренний контракт
 * scheduler → processor, валидаторы не нужны). monthKey — месяц запуска
 * YYYY-MM в TZ портала: часть jobId (один снапшот вида на портал в месяц).
 */
export interface AiSnapshotJobData {
    domain: string;
    kind: AiAnalyticsSnapshotKind;
    monthKey: string;
}

/** Итог месячного снапшота аудита (для логов процессора и тестов). */
export interface AiAuditSnapshotResult {
    domain: string;
    monthKey: string;
    /** ISO (UTC). */
    generatedAt: string;
    /** Звонков в окне и с глубоким разбором — краткая сводка отчёта. */
    calls: number;
    analyzed: number;
}
