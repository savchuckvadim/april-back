import type {
    AnalyticsCallLiteRow,
    AnalyticsLiteSelfIntro,
} from '@lib/call-lib/call-report-analytics/types/analytics-lite.types';
import type {
    CallReportOutcomeCode,
    CallReportSectionCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import type {
    CallBadgeOutcomeId,
    CallBadgeWeakId,
} from '../call-badges.catalog';
import { callBadgeState } from '../call-badges.evaluate';
import {
    liteRow,
    methodologyFacts,
    objectionOf,
    reportFacts,
    sectionOf,
    styleMarks,
} from './call-badges.fixtures';

const INTRO_YES: AnalyticsLiteSelfIntro = {
    introduced: true,
    companyNamed: null,
    offerQuestion: null,
};
const INTRO_NO: AnalyticsLiteSelfIntro = { ...INTRO_YES, introduced: false };

type RowOverrides = Partial<AnalyticsCallLiteRow>;

describe('callBadgeState — следующий шаг', () => {
    it('step_missing: шаг не назначен — да, назначен — нет, данных нет — неизвестно', () => {
        const state = (overrides: RowOverrides) =>
            callBadgeState('step_missing', liteRow(overrides));
        expect(state({ nextStep: { set: false, date: null } })).toBe('yes');
        expect(state({ nextStep: { set: true, date: '2026-11-12' } })).toBe(
            'no',
        );
        expect(state({ nextStep: null })).toBe('unknown');
    });

    it('step_no_date: шаг без даты — да, с датой или без шага — нет, данных нет — неизвестно', () => {
        const state = (overrides: RowOverrides) =>
            callBadgeState('step_no_date', liteRow(overrides));
        expect(state({ nextStep: { set: true, date: null } })).toBe('yes');
        expect(state({ nextStep: { set: true, date: '' } })).toBe('yes');
        expect(state({ nextStep: { set: true, date: '2026-11-12' } })).toBe(
            'no',
        );
        expect(state({ nextStep: { set: false, date: null } })).toBe('no');
        expect(state({ nextStep: null })).toBe('unknown');
    });
});

describe('callBadgeState — возражения и сигнал', () => {
    it('objection_unhandled: есть неотработанное — да, иначе — нет', () => {
        const state = (handled: boolean | null) =>
            callBadgeState(
                'objection_unhandled',
                liteRow({ objections: [objectionOf({ handled })] }),
            );
        expect(state(false)).toBe('yes');
        expect(state(true)).toBe('no');
        expect(state(null)).toBe('no');
        expect(callBadgeState('objection_unhandled', liteRow())).toBe('no');
    });

    it('signal: доказанный риск-флаг — да, голый флаг без цитаты — нет', () => {
        const proven = liteRow({
            riskFlags: ['conflict'],
            riskEvidence: [
                {
                    flag: 'conflict',
                    quote: 'Да пошли вы',
                    speaker: 'manager',
                    at: 12,
                },
            ],
        });
        expect(callBadgeState('signal', proven)).toBe('yes');
        expect(
            callBadgeState('signal', liteRow({ riskFlags: ['conflict'] })),
        ).toBe('no');
        expect(callBadgeState('signal', liteRow())).toBe('no');
    });

    it('signal: возражение без ответа, после которого клиент ушёл, — да', () => {
        const row = liteRow({
            objections: [
                objectionOf({ handled: false, outcome: 'disengaged' }),
            ],
        });
        expect(callBadgeState('signal', row)).toBe('yes');
    });

    it('signal: показ без выявленных потребностей — да', () => {
        const row = liteRow({
            style: styleMarks({ presentationDone: true, needsFound: false }),
        });
        expect(callBadgeState('signal', row)).toBe('yes');
    });
});

describe('callBadgeState — итог разговора', () => {
    const CASES: ReadonlyArray<[CallBadgeOutcomeId, CallReportOutcomeCode]> = [
        ['outcome_advanced', 'advanced'],
        ['outcome_callback', 'callback_dated'],
        ['outcome_postponed', 'postponed'],
        ['outcome_refused', 'refused'],
        ['outcome_no_contact', 'no_contact'],
    ];

    it.each(CASES)('%s: свой итог — да, чужой — нет', (badge, outcome) => {
        const own = liteRow({ report: reportFacts({ outcome }) });
        const other = liteRow({
            report: reportFacts({
                outcome: outcome === 'refused' ? 'advanced' : 'refused',
            }),
        });
        expect(callBadgeState(badge, own)).toBe('yes');
        expect(callBadgeState(badge, other)).toBe('no');
    });

    it.each(CASES)('%s: старый разбор с пустым report — неизвестно', badge => {
        expect(callBadgeState(badge, liteRow({ report: reportFacts() }))).toBe(
            'unknown',
        );
        expect(callBadgeState(badge, liteRow())).toBe('unknown');
    });
});

describe('callBadgeState — методика', () => {
    it('progress_low: 1 и 2 — да, 3 — нет, не считалось — неизвестно', () => {
        const state = (dealProgress: number | null) =>
            callBadgeState(
                'progress_low',
                liteRow({ methodology: methodologyFacts({ dealProgress }) }),
            );
        expect(state(1)).toBe('yes');
        expect(state(2)).toBe('yes');
        expect(state(3)).toBe('no');
        expect(state(null)).toBe('unknown');
        expect(callBadgeState('progress_low', liteRow())).toBe('unknown');
    });

    it('capped: есть срезавшие ограничители — да, нет — нет, нет методики — неизвестно', () => {
        const state = (capsApplied: number) =>
            callBadgeState(
                'capped',
                liteRow({ methodology: methodologyFacts({ capsApplied }) }),
            );
        expect(state(1)).toBe('yes');
        expect(state(0)).toBe('no');
        expect(callBadgeState('capped', liteRow())).toBe('unknown');
    });
});

describe('callBadgeState — цена, допродажа, собеседник, представление, сбои', () => {
    const PRICE = {
        amount: 24000,
        periodMonths: 12,
        product: null,
        kind: null,
    };

    it('price_named: цена в фактах или маркер стиля — да; факты есть, цены нет — нет; данных нет — неизвестно', () => {
        const state = (overrides: RowOverrides) =>
            callBadgeState('price_named', liteRow(overrides));
        expect(state({ report: reportFacts({ prices: [PRICE] }) })).toBe('yes');
        expect(state({ style: styleMarks({ priceDiscussed: true }) })).toBe(
            'yes',
        );
        expect(state({ report: reportFacts({ outcome: 'postponed' }) })).toBe(
            'no',
        );
        expect(state({ style: styleMarks({ priceDiscussed: false }) })).toBe(
            'no',
        );
        expect(state({ report: reportFacts(), style: styleMarks() })).toBe(
            'unknown',
        );
        expect(state({})).toBe('unknown');
    });

    it('upsell_tried: пробовал — да, не пробовал — нет, не знаем — неизвестно', () => {
        const state = (upsellAttempted: boolean | null) =>
            callBadgeState(
                'upsell_tried',
                liteRow({ report: reportFacts({ upsellAttempted }) }),
            );
        expect(state(true)).toBe('yes');
        expect(state(false)).toBe('no');
        expect(state(null)).toBe('unknown');
    });

    it('not_lpr: любая роль кроме ЛПР — да, ЛПР — нет, роли нет — неизвестно', () => {
        const state = (interlocutorRole: string | null) =>
            callBadgeState(
                'not_lpr',
                liteRow({ style: styleMarks({ interlocutorRole }) }),
            );
        expect(state('secretary')).toBe('yes');
        expect(state('user')).toBe('yes');
        expect(state('lpr')).toBe('no');
        expect(state(null)).toBe('unknown');
        expect(callBadgeState('not_lpr', liteRow())).toBe('unknown');
    });

    it('no_self_intro: не представился — да, представился — нет, не знаем — неизвестно', () => {
        const state = (selfIntro: AnalyticsLiteSelfIntro | null) =>
            callBadgeState(
                'no_self_intro',
                liteRow({ report: reportFacts({ selfIntro }) }),
            );
        expect(state(INTRO_NO)).toBe('yes');
        expect(state(INTRO_YES)).toBe('no');
        expect(state({ ...INTRO_YES, introduced: null })).toBe('unknown');
        expect(state(null)).toBe('unknown');
    });

    it('issue: есть сбой — да, факты есть, сбоев нет — нет, старый разбор — неизвестно', () => {
        const withIssue = reportFacts({
            outcome: 'no_contact',
            issues: [{ code: 'wrong_number', quote: null }],
        });
        expect(callBadgeState('issue', liteRow({ report: withIssue }))).toBe(
            'yes',
        );
        expect(
            callBadgeState(
                'issue',
                liteRow({ report: reportFacts({ outcome: 'advanced' }) }),
            ),
        ).toBe('no');
        expect(
            callBadgeState('issue', liteRow({ report: reportFacts() })),
        ).toBe('unknown');
        expect(callBadgeState('issue', liteRow())).toBe('unknown');
    });
});

describe('callBadgeState — потребности и слабые разделы', () => {
    it('needs_missing: не выявлены — да, выявлены — нет, маркера нет — неизвестно', () => {
        const state = (needsFound: boolean | null) =>
            callBadgeState(
                'needs_missing',
                liteRow({ style: styleMarks({ needsFound }) }),
            );
        expect(state(false)).toBe('yes');
        expect(state(true)).toBe('no');
        expect(state(null)).toBe('unknown');
    });

    it('needs_missing: раздел потребностей неприменим (актуальность 0) — неизвестно', () => {
        const row = liteRow({
            sections: [sectionOf('NEEDS', null, 0)],
            style: styleMarks({ needsFound: false }),
        });
        expect(callBadgeState('needs_missing', row)).toBe('unknown');
    });

    const WEAK: ReadonlyArray<[CallBadgeWeakId, CallReportSectionCode]> = [
        ['weak_greeting', 'GREETING'],
        ['weak_needs', 'NEEDS'],
        ['weak_presentation', 'PRESENTATION'],
        ['weak_objections', 'OBJECTIONS'],
        ['weak_price', 'PRICE'],
        ['weak_closing', 'CLOSING'],
        ['weak_refusal', 'REFUSAL'],
    ];

    it.each(WEAK)(
        '%s: оценка раздела 5 и ниже — да, 6 и выше — нет',
        (badge, code) => {
            const state = (score: number) =>
                callBadgeState(
                    badge,
                    liteRow({ sections: [sectionOf(code, score)] }),
                );
            expect(state(1)).toBe('yes');
            expect(state(5)).toBe('yes');
            expect(state(6)).toBe('no');
            expect(state(10)).toBe('no');
        },
    );

    it.each(WEAK)(
        '%s: раздела нет, он неприменим или без оценки — неизвестно',
        (badge, code) => {
            const state = (overrides: RowOverrides) =>
                callBadgeState(badge, liteRow(overrides));
            expect(state({ sections: [] })).toBe('unknown');
            expect(state({ sections: [sectionOf(code, 3, 0)] })).toBe(
                'unknown',
            );
            expect(state({ sections: [sectionOf(code, null)] })).toBe(
                'unknown',
            );
        },
    );

    it('weak_*: оценка другого раздела не засчитывается', () => {
        const row = liteRow({ sections: [sectionOf('PRICE', 2)] });
        expect(callBadgeState('weak_greeting', row)).toBe('unknown');
        expect(callBadgeState('weak_price', row)).toBe('yes');
    });
});
