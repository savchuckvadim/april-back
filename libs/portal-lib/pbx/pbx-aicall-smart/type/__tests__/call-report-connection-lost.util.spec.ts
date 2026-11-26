import type { CallReportConnectionLostSource } from '../call-report-connection-lost.util';
import { isConnectionLostReported } from '../call-report-connection-lost.util';
import {
    CALL_REPORT_ISSUE_CONNECTION_LOST,
    CALL_REPORT_OUTCOME_CONNECTION_LOST,
} from '../pbx-aicall-report-facts.type';

describe('isConnectionLostReported — в разборе отмечен обрыв связи', () => {
    it('исход «связь прервалась» — да', () => {
        expect(
            isConnectionLostReported({
                outcome: CALL_REPORT_OUTCOME_CONNECTION_LOST,
                issues: [],
            }),
        ).toBe(true);
    });

    it('сбой «связь прервалась» при другом исходе — да', () => {
        expect(
            isConnectionLostReported({
                outcome: 'no_contact',
                issues: [
                    { code: 'wrong_contact' },
                    { code: CALL_REPORT_ISSUE_CONNECTION_LOST },
                ],
            }),
        ).toBe(true);
    });

    it('и исход, и сбой — да', () => {
        expect(
            isConnectionLostReported({
                outcome: CALL_REPORT_OUTCOME_CONNECTION_LOST,
                issues: [{ code: CALL_REPORT_ISSUE_CONNECTION_LOST }],
            }),
        ).toBe(true);
    });

    it('ни исхода, ни сбоя — нет; «телефония» — не обрыв', () => {
        expect(
            isConnectionLostReported({
                outcome: 'advanced',
                issues: [{ code: 'telephony' }],
            }),
        ).toBe(false);
    });

    it('пустые значения — нет: нет разбора, нет фактов, пустые поля', () => {
        expect(isConnectionLostReported(null)).toBe(false);
        expect(isConnectionLostReported(undefined)).toBe(false);
        expect(isConnectionLostReported({})).toBe(false);
        expect(isConnectionLostReported({ outcome: null, issues: null })).toBe(
            false,
        );
        expect(
            isConnectionLostReported({ outcome: undefined, issues: undefined }),
        ).toBe(false);
        expect(isConnectionLostReported({ outcome: '', issues: [] })).toBe(
            false,
        );
    });

    it('принимает и изменяемый, и readonly-массив сбоев без приведений', () => {
        const mutable: CallReportConnectionLostSource = {
            issues: [{ code: CALL_REPORT_ISSUE_CONNECTION_LOST }],
        };
        const frozen: CallReportConnectionLostSource = {
            issues: [{ code: 'telephony' }] as const,
        };
        expect(isConnectionLostReported(mutable)).toBe(true);
        expect(isConnectionLostReported(frozen)).toBe(false);
    });
});
