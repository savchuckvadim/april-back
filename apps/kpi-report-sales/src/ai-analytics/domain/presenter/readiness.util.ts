/**
 * Готовность витрины (план, 4.11) по lite-строкам окна: месяцы истории
 * (от первого разобранного звонка), разобранные презентации, дата
 * сопоставимости версий. Чистые функции.
 */
import { CALL_REPORT_CALL_TYPE_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { comparableFrom } from '@lib/sales-ai-analytics';
import {
    AI_ANALYTICS_READINESS,
    AiAnalyticsReadinessMode,
} from '../../constants/ai-analytics.const';
import { ReadinessDto } from '../../dto/readiness.dto';
import { DatedLiteRow } from '../loaders/lite-row.mapper';

const PRESENTATION_TYPE: (typeof CALL_REPORT_CALL_TYPE_CODES)[number] =
    'presentation';
const MS_PER_MONTH = 30.44 * 86_400_000;

export const READINESS_REASONS = {
    kpiOnly: 'no-analysis-in-pipeline-window',
    historyShort: `history-months-below-${AI_ANALYTICS_READINESS.calibrationMonths}`,
    presentationsFew: `presentations-below-${AI_ANALYTICS_READINESS.calibrationPresentations}`,
    salesNotComputed: 'sales-not-computed-in-phase-1a',
} as const;

/** Дата сопоставимости: max по датам версий всех разборов окна. */
export function resolveComparableFrom(rows: readonly DatedLiteRow[]): string {
    const versionValues = rows.flatMap(row =>
        row.versions ? Object.values(row.versions) : [],
    );
    return comparableFrom(versionValues);
}

export function buildReadiness(
    rows: readonly DatedLiteRow[],
    options: { now: Date; enabled: boolean; pipelineEnabled: boolean },
): ReadinessDto {
    const analyzed = rows.filter(row => row.analysisPresent);
    const earliest = analyzed.reduce<number | null>(
        (min, row) =>
            min === null
                ? row.callStartedAt.getTime()
                : Math.min(min, row.callStartedAt.getTime()),
        null,
    );
    const historyMonths =
        earliest === null
            ? 0
            : Math.floor((options.now.getTime() - earliest) / MS_PER_MONTH);
    const presentations = analyzed.filter(
        row => row.callType === PRESENTATION_TYPE,
    ).length;

    const reasons: string[] = [];
    let mode: AiAnalyticsReadinessMode = 'descriptive';
    if (options.enabled && !options.pipelineEnabled) {
        mode = 'kpi-only';
        reasons.push(READINESS_REASONS.kpiOnly);
    } else {
        if (historyMonths < AI_ANALYTICS_READINESS.calibrationMonths) {
            reasons.push(READINESS_REASONS.historyShort);
        }
        if (presentations < AI_ANALYTICS_READINESS.calibrationPresentations) {
            reasons.push(READINESS_REASONS.presentationsFew);
        }
        if (reasons.length) mode = 'calibration';
    }
    // Продажи считаются с Фазы 1b (закрытые сделки) — честно помечаем.
    reasons.push(READINESS_REASONS.salesNotComputed);

    return {
        mode,
        historyMonths,
        presentations,
        sales: 0,
        comparableFrom: resolveComparableFrom(rows),
        reasons,
    };
}
