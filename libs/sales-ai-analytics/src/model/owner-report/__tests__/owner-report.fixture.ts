import type { AnalyticsLiteStyle } from '@lib/call-lib/call-report-analytics/types/analytics-lite.types';
import { DEFAULT_WORK_CALENDAR } from '../../workdays.util';
import type {
    OwnerReportCallInput,
    OwnerReportPeriod,
} from '../owner-report.types';

/** Октябрь 2026 по Москве: 01.10 — четверг, 30.10 — пятница. */
export const OCTOBER: OwnerReportPeriod = {
    kind: 'month',
    from: '2026-10-01',
    to: '2026-10-31',
    timeZone: 'Europe/Moscow',
    calendar: DEFAULT_WORK_CALENDAR,
};

/** Маркеры стиля разговора с ЛПР, где выявили потребности и показали систему. */
export const DEFAULT_STYLE: AnalyticsLiteStyle = {
    talkRatioPct: null,
    questionsCount: null,
    needsFound: true,
    needsCount: 1,
    presentationDone: true,
    productsOfferedCount: 1,
    priceDiscussed: false,
    competitorsCount: 0,
    refusalCategory: null,
    interlocutorRole: 'lpr',
    productive: true,
    scriptCompliance: null,
    callDirection: null,
};

/** Факты focus-v3.1 без сбоев, цен и допродажи. */
export function defaultReport(
    overrides: Partial<NonNullable<OwnerReportCallInput['report']>> = {},
): NonNullable<OwnerReportCallInput['report']> {
    return {
        outcome: 'advanced',
        issues: [],
        prices: [],
        upsellAttempted: false,
        upsellKind: null,
        selfIntro: {
            introduced: true,
            companyNamed: true,
            offerQuestion: 'none',
        },
        ...overrides,
    };
}

let counter = 0;

export function resetCounter(): void {
    counter = 0;
}

interface CallOverrides extends Partial<OwnerReportCallInput> {
    day?: string;
    outcome?: string | null;
    topics?: string[];
    issues?: string[];
}

/** Звонок с полным разбором focus-v3.1; всё лишнее переопределяется. */
export function call(overrides: CallOverrides = {}): OwnerReportCallInput {
    counter += 1;
    const {
        day = '2026-10-05',
        outcome = 'advanced',
        topics = [],
        issues = [],
        ...rest
    } = overrides;
    return {
        transcriptionId: `t${counter}`,
        managerId: '7',
        callStartedAt: new Date(`${day}T09:00:00+03:00`),
        durationSec: 300,
        callType: 'cold',
        analysisPresent: true,
        score: 70,
        nextStep: { set: true, date: '2026-10-20', kind: 'presentation' },
        riskFlags: [],
        riskEvidence: [],
        coachingPriority: null,
        sections: [
            {
                section: 'CLOSING',
                relevance: 100,
                score: 7,
                asWas: null,
                alternatives: [],
            },
        ],
        objections: topics.map(topic => ({
            category: null,
            quote: null,
            handled: true,
            outcome: 'continued',
            topic,
        })),
        versions: null,
        style: DEFAULT_STYLE,
        report: defaultReport({
            outcome,
            issues: issues.map(code => ({ code, quote: 'цитата' })),
        }),
        ...rest,
    };
}

/** Старый разбор без фактов focus-v3.1: исход выводится по прежним полям. */
export function legacyCall(
    overrides: CallOverrides = {},
): OwnerReportCallInput {
    return { ...call(overrides), report: undefined };
}
