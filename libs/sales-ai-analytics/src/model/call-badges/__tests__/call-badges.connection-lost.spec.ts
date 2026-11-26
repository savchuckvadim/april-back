import {
    CALL_REPORT_ISSUE_CONNECTION_LOST,
    CALL_REPORT_OUTCOME_CONNECTION_LOST,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { callBadgesOf, callBadgeState } from '../call-badges.evaluate';
import { liteRow, reportFacts } from './call-badges.fixtures';

/**
 * Обрыв связи — не вина менеджера (26.11.2026): при отмеченном обрыве
 * (исход ИЛИ сбой «связь прервалась») «Шаг не назначен» и «Шаг без даты» —
 * «неизвестно» (судить не по чему), а «Сбой не по вине разговора» — «да»
 * и без сбоев в списке, если исход «связь прервалась».
 */
const LOST = CALL_REPORT_OUTCOME_CONNECTION_LOST;
const LOST_ISSUE = { code: CALL_REPORT_ISSUE_CONNECTION_LOST, quote: null };

const lostByOutcome = reportFacts({ outcome: LOST });
const lostByIssue = reportFacts({ outcome: 'postponed', issues: [LOST_ISSUE] });
const noLoss = reportFacts({ outcome: 'postponed' });

describe('бейджи шага при обрыве связи', () => {
    const NO_STEP = { set: false, date: null };
    const NO_DATE = { set: true, date: null };

    it('step_missing: «шаг не назначен» при обрыве — неизвестно (исход и сбой)', () => {
        for (const report of [lostByOutcome, lostByIssue]) {
            expect(
                callBadgeState(
                    'step_missing',
                    liteRow({ nextStep: NO_STEP, report }),
                ),
            ).toBe('unknown');
        }
    });

    it('step_no_date: «шаг без даты» при обрыве — неизвестно (исход и сбой)', () => {
        for (const report of [lostByOutcome, lostByIssue]) {
            expect(
                callBadgeState(
                    'step_no_date',
                    liteRow({ nextStep: NO_DATE, report }),
                ),
            ).toBe('unknown');
        }
    });

    it('без обрыва бейджи шага как раньше: да / нет', () => {
        expect(
            callBadgeState(
                'step_missing',
                liteRow({ nextStep: NO_STEP, report: noLoss }),
            ),
        ).toBe('yes');
        expect(
            callBadgeState(
                'step_no_date',
                liteRow({ nextStep: NO_DATE, report: noLoss }),
            ),
        ).toBe('yes');
        // Без отчётных фактов вовсе (старый разбор) — тоже как раньше.
        expect(
            callBadgeState('step_missing', liteRow({ nextStep: NO_STEP })),
        ).toBe('yes');
    });

    it('в списке бейджей звонка при обрыве нет «шаг не назначен» и «шаг без даты»', () => {
        const ids = callBadgesOf(
            liteRow({ nextStep: NO_STEP, report: lostByOutcome }),
        );

        expect(ids).not.toContain('step_missing');
        expect(ids).not.toContain('step_no_date');
        expect(ids).toContain('outcome_connection_lost');
    });
});

describe('бейдж «Сбой не по вине разговора» при обрыве связи', () => {
    it('исход «связь прервалась» при пустом списке сбоев — «да»', () => {
        expect(
            callBadgeState('issue', liteRow({ report: lostByOutcome })),
        ).toBe('yes');
        expect(callBadgesOf(liteRow({ report: lostByOutcome }))).toContain(
            'issue',
        );
    });

    it('сбой «связь прервалась» в списке — «да»', () => {
        expect(callBadgeState('issue', liteRow({ report: lostByIssue }))).toBe(
            'yes',
        );
    });

    it('без обрыва и без сбоев — «нет»; без фактов — «неизвестно»', () => {
        expect(callBadgeState('issue', liteRow({ report: noLoss }))).toBe('no');
        expect(
            callBadgeState('issue', liteRow({ report: reportFacts() })),
        ).toBe('unknown');
    });
});
