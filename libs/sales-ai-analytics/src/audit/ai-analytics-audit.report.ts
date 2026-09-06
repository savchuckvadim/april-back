/**
 * Модель отчёта аудита: композиция агрегатов calc + рекомендация.
 * Рендер в markdown — ai-analytics-audit.markdown.ts.
 */
import {
    analysisCells,
    analyzedShareInCellsWithMinN,
    collapseCellsByManagerMonth,
    DurationStats,
    durationStats,
    durationStatsByMonth,
    FieldPresence,
    fieldPresence,
    managerCoverageByMonth,
    ManagerCoverageRow,
    MonthPivot,
    noiseShareByMonth,
    NoiseShareRow,
    pivotCellsByMonth,
    VersionRow,
    versionsByMonth,
} from './ai-analytics-audit.calc';
import { AuditAiDepth, AuditDataset } from './ai-analytics-audit.load';
import {
    AUDIT_RULES,
    AuditRules,
    buildThresholdRecommendation,
    ThresholdRecommendation,
} from './ai-analytics-audit.recommend';

export interface AuditReportMeta {
    domain: string;
    timeZone: string;
    /** Ключи месяцев окна YYYY-MM по возрастанию. */
    months: string[];
    /** Дата формирования YYYY-MM-DD. */
    generatedAt: string;
}

export interface AuditReport {
    meta: AuditReportMeta;
    rules: AuditRules;
    totals: {
        fetchedTranscriptions: number;
        outsideWindow: number;
        calls: number;
        withManager: number;
        analyzed: number;
    };
    coverage: ManagerCoverageRow[];
    pivots: MonthPivot[];
    analyzedInCellsPct: number | null;
    analyzedByManagerMonthPct: number | null;
    noise: NoiseShareRow[];
    duration: DurationStats;
    durationByMonth: (DurationStats & { month: string })[];
    versions: VersionRow[];
    fields: FieldPresence;
    depth: AuditAiDepth[];
    recommendation: ThresholdRecommendation;
}

export function buildAuditReport(
    dataset: AuditDataset,
    meta: AuditReportMeta,
    rules: AuditRules = AUDIT_RULES,
): AuditReport {
    const { rows } = dataset;
    const cells = analysisCells(rows);
    const analyzedInCellsPct = analyzedShareInCellsWithMinN(
        cells,
        rules.cellMinN,
    );
    const analyzedByManagerMonthPct = analyzedShareInCellsWithMinN(
        collapseCellsByManagerMonth(cells),
        rules.cellMinN,
    );
    const duration = durationStats(rows, rules.shortCallSec);

    return {
        meta,
        rules,
        totals: {
            fetchedTranscriptions: dataset.fetchedTranscriptions,
            outsideWindow: dataset.outsideWindow,
            calls: rows.length,
            withManager: rows.filter(row => row.managerId !== null).length,
            analyzed: rows.filter(row => row.analysisPresent).length,
        },
        coverage: managerCoverageByMonth(rows),
        pivots: pivotCellsByMonth(cells, rules.cellMinN),
        analyzedInCellsPct,
        analyzedByManagerMonthPct,
        noise: noiseShareByMonth(rows),
        duration,
        durationByMonth: durationStatsByMonth(rows, rules.shortCallSec),
        versions: versionsByMonth(rows),
        fields: fieldPresence(rows),
        depth: dataset.depth,
        recommendation: buildThresholdRecommendation(
            {
                analyzedInCellsPct,
                analyzedByManagerMonthPct,
                shortPct: duration.shortPct,
            },
            rules,
        ),
    };
}
