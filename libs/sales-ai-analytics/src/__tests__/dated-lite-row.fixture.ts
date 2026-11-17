import type { AnalyticsLiteSection } from '@lib/call-lib/call-report-analytics/types/analytics-lite.types';
import type { DatedLiteRow } from '../model/dated-lite-row';

/**
 * Lite-строка звонка с датой (как её отдаёт call-lib loadLite): разобранная
 * презентация менеджера '10' 2 сентября 2026, 10 минут, оценка 70 из 100,
 * шаг с датой. Те же значения по умолчанию, что у фикстуры обзора в
 * kpi-report-sales, — тесты фактов качества переехали вместе с кодом.
 */
export const datedLiteRow = (
    patch: Partial<DatedLiteRow> & { transcriptionId: string },
): DatedLiteRow => ({
    managerId: '10',
    callStartedAt: new Date('2026-09-02T08:00:00Z'),
    durationSec: 600,
    callType: 'presentation',
    analysisPresent: true,
    score: 70,
    nextStep: { set: true, date: '2026-09-10' },
    riskFlags: [],
    coachingPriority: 'none',
    sections: [],
    objections: [],
    versions: null,
    ...patch,
});

/** Раздел разбора: код, оценка 1–10, актуальность (0 — не применим). */
export const liteSection = (
    code: string,
    score: number | null,
    relevance = 1,
): AnalyticsLiteSection => ({
    section: code,
    relevance,
    score,
    asWas: null,
    alternatives: [],
});
