import {
    CALL_REPORT_ISSUE_CONNECTION_LOST,
    CALL_REPORT_OUTCOME_CONNECTION_LOST,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import {
    resolveLiteSignal,
    toSignalView,
    type SignalSourceRow,
} from '../model/manager-signal.lite';
import {
    ManagerSignalCallView,
    resolveManagerSignal,
} from '../model/manager-signal.rules';
import {
    liteRow,
    reportFacts,
} from '../model/call-badges/__tests__/call-badges.fixtures';

/**
 * Обрыв связи — не вина менеджера (26.11.2026): при обрыве «дверь закрыта»
 * сигналом не бывает (страховка для уже записанных разборов), а причина
 * «клиент после этого ушёл из разговора» у возражения не засчитывается —
 * остаётся только «менеджер не ответил по существу».
 */
const ALL_FLAGS = ['conflict', 'compliance', 'door_closed'] as const;

const view = (
    overrides: Partial<ManagerSignalCallView> = {},
): ManagerSignalCallView => ({
    riskFlags: [],
    riskEvidence: [],
    objections: [],
    sections: [],
    presentationDone: null,
    needsFound: null,
    spiralsFull: null,
    ...overrides,
});

const evidence = (flag: string) => [{ flag, quote: 'Ладно, до свидания' }];

const objection = (
    overrides: Partial<ManagerSignalCallView['objections'][number]> = {},
) => ({
    quote: 'Дорого у вас',
    handled: false,
    outcome: null,
    reaction: null,
    ...overrides,
});

describe('сигнал руководителю: флаг «дверь закрыта» при обрыве связи', () => {
    const door = {
        riskFlags: ['door_closed'],
        riskEvidence: evidence('door_closed'),
    };

    it('без обрыва «дверь закрыта» с цитатой — сигнал', () => {
        expect(resolveManagerSignal(view(door), ALL_FLAGS)?.kind).toBe(
            'door_closed',
        );
        expect(
            resolveManagerSignal(
                view({ ...door, connectionLost: false }),
                ALL_FLAGS,
            )?.kind,
        ).toBe('door_closed');
    });

    it('при обрыве «дверь закрыта» сигнала не даёт', () => {
        expect(
            resolveManagerSignal(
                view({ ...door, connectionLost: true }),
                ALL_FLAGS,
            ),
        ).toBeNull();
    });

    it('при обрыве другие флаги работают как раньше', () => {
        const signal = resolveManagerSignal(
            view({
                riskFlags: ['door_closed', 'conflict'],
                riskEvidence: [
                    ...evidence('door_closed'),
                    ...evidence('conflict'),
                ],
                connectionLost: true,
            }),
            ALL_FLAGS,
        );

        expect(signal?.kind).toBe('conflict');
    });
});

describe('сигнал руководителю: возражение при обрыве связи', () => {
    const left = objection({ outcome: 'disengaged' });
    const leftAndOffPoint = objection({
        outcome: 'disengaged',
        reaction: 'other',
    });

    it('без обрыва клиент ушёл — сигнал «возражение не отработано»', () => {
        const signal = resolveManagerSignal(
            view({ objections: [left] }),
            ALL_FLAGS,
        );

        expect(signal?.kind).toBe('objection_mishandled');
        expect(signal?.detail).toBe('клиент после этого ушёл из разговора');
    });

    it('при обрыве «клиент ушёл» не причина: возражение сигнала не даёт', () => {
        expect(
            resolveManagerSignal(
                view({ objections: [left], connectionLost: true }),
                ALL_FLAGS,
            ),
        ).toBeNull();
    });

    it('при обрыве остаётся причина «не ответил по существу» — сигнал только с ней', () => {
        const signal = resolveManagerSignal(
            view({ objections: [leftAndOffPoint], connectionLost: true }),
            ALL_FLAGS,
        );

        expect(signal).toMatchObject({
            kind: 'objection_mishandled',
            quote: 'Дорого у вас',
            detail: 'менеджер не ответил по существу',
        });
    });

    it('без обрыва обе причины перечислены, как раньше', () => {
        const signal = resolveManagerSignal(
            view({ objections: [leftAndOffPoint] }),
            ALL_FLAGS,
        );

        expect(signal?.detail).toBe(
            'менеджер не ответил по существу, клиент после этого ушёл из разговора',
        );
    });

    it('при обрыве проверяется следующее возражение: у первого причин не осталось', () => {
        const signal = resolveManagerSignal(
            view({
                objections: [
                    left,
                    objection({ quote: 'Нет бюджета', reaction: 'other' }),
                ],
                connectionLost: true,
            }),
            ALL_FLAGS,
        );

        expect(signal?.quote).toBe('Нет бюджета');
    });
});

describe('сигнал по lite-строке: признак обрыва берётся из report', () => {
    const row = (report: SignalSourceRow['report']): SignalSourceRow => ({
        ...liteRow({
            riskFlags: ['door_closed'],
            riskEvidence: [
                {
                    flag: 'door_closed',
                    quote: 'Ладно',
                    speaker: 'client',
                    at: null,
                },
            ],
            objections: [
                {
                    category: null,
                    quote: 'Дорого',
                    handled: false,
                    outcome: 'disengaged',
                },
            ],
        }),
        report,
    });

    it('исход «связь прервалась» и сбой «связь прервалась» — признак есть', () => {
        for (const report of [
            reportFacts({ outcome: CALL_REPORT_OUTCOME_CONNECTION_LOST }),
            reportFacts({
                outcome: 'postponed',
                issues: [
                    { code: CALL_REPORT_ISSUE_CONNECTION_LOST, quote: null },
                ],
            }),
        ]) {
            expect(toSignalView(row(report)).connectionLost).toBe(true);
            expect(resolveLiteSignal(row(report))).toBeNull();
        }
    });

    it('без обрыва и без report признака нет, сигнал как раньше', () => {
        expect(
            toSignalView(row(reportFacts({ outcome: 'refused' })))
                .connectionLost,
        ).toBeUndefined();
        expect(toSignalView(row(undefined)).connectionLost).toBeUndefined();
        expect(resolveLiteSignal(row(undefined))?.kind).toBe('door_closed');
    });
});
