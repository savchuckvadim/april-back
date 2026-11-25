import type {
    AnalyticsCallLiteRow,
    AnalyticsLiteMethodology,
    AnalyticsLiteObjection,
    AnalyticsLiteReportFacts,
    AnalyticsLiteSection,
    AnalyticsLiteStyle,
} from '@lib/call-lib/call-report-analytics/types/analytics-lite.types';
import type { CallReportSectionCode } from '@lib/portal-lib/pbx/pbx-aicall-smart';

/** Валидная lite-строка разобранного звонка: ни одного признака, всё null / пусто. */
export const liteRow = (
    overrides: Partial<AnalyticsCallLiteRow> = {},
): AnalyticsCallLiteRow => ({
    transcriptionId: '10245',
    managerId: '447',
    callStartedAt: new Date('2026-11-10T09:00:00.000Z'),
    durationSec: 180,
    callType: null,
    analysisPresent: true,
    score: 60,
    nextStep: null,
    riskFlags: [],
    coachingPriority: null,
    sections: [],
    objections: [],
    versions: null,
    ...overrides,
});

/** Факты отчёта: по умолчанию пусто, как у старого разбора. */
export const reportFacts = (
    overrides: Partial<AnalyticsLiteReportFacts> = {},
): AnalyticsLiteReportFacts => ({
    outcome: null,
    issues: [],
    prices: [],
    upsellAttempted: null,
    upsellKind: null,
    selfIntro: null,
    ...overrides,
});

/** Маркеры стиля: по умолчанию все null. */
export const styleMarks = (
    overrides: Partial<AnalyticsLiteStyle> = {},
): AnalyticsLiteStyle => ({
    talkRatioPct: null,
    questionsCount: null,
    needsFound: null,
    needsCount: null,
    presentationDone: null,
    productsOfferedCount: null,
    priceDiscussed: null,
    competitorsCount: null,
    refusalCategory: null,
    interlocutorRole: null,
    productive: null,
    scriptCompliance: null,
    callDirection: null,
    ...overrides,
});

/** Методика и продвижение: по умолчанию «методики нет, ограничителей нет». */
export const methodologyFacts = (
    overrides: Partial<AnalyticsLiteMethodology> = {},
): AnalyticsLiteMethodology => ({
    code: null,
    checkpointsDone: null,
    checkpointsTotal: null,
    spiralsFull: null,
    spiralsMinFull: null,
    dealProgress: null,
    capsApplied: 0,
    ...overrides,
});

/** Раздел разговора: по умолчанию применим (актуальность 100). */
export const sectionOf = (
    code: CallReportSectionCode,
    score: number | null,
    relevance = 100,
): AnalyticsLiteSection => ({
    section: code,
    relevance,
    score,
    asWas: null,
    alternatives: [],
});

/** Возражение клиента: по умолчанию без отметки «отработано». */
export const objectionOf = (
    overrides: Partial<AnalyticsLiteObjection> = {},
): AnalyticsLiteObjection => ({
    category: null,
    quote: 'Дорого у вас',
    handled: null,
    outcome: null,
    ...overrides,
});
