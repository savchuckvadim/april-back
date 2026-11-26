import {
    resolveAlertSignal,
    toSignalView,
} from '../services/call-report-alert-message.util';
import { toMethodologyView } from '../services/call-focus-methodology.util';

/**
 * Обрыв связи — не вина менеджера (26.11.2026): признак из разбора (исход
 * или сбой «связь прервалась») попадает и в проекцию для сигнала РОПу, и в
 * срез разбора для методики. Без обрыва проекции не меняются.
 */
const analysis = (overrides: Record<string, unknown> = {}) =>
    ({
        callType: 'presentation',
        riskFlags: [],
        needsFound: true,
        presentationDone: true,
        objections: [],
        sections: [],
        ...overrides,
    }) as never;

const lostByOutcome = { outcome: 'connection_lost' };
const lostByIssue = {
    outcome: 'refused',
    issues: [{ code: 'connection_lost', quote: 'и вот' }],
};
const notLost = { outcome: 'refused', issues: [{ code: 'telephony' }] };

describe('toSignalView: признак обрыва связи', () => {
    it('исход и сбой дают connectionLost', () => {
        expect(toSignalView(analysis(lostByOutcome)).connectionLost).toBe(true);
        expect(toSignalView(analysis(lostByIssue)).connectionLost).toBe(true);
    });

    it('без обрыва поля в проекции нет', () => {
        expect(toSignalView(analysis(notLost))).not.toHaveProperty(
            'connectionLost',
        );
        expect(toSignalView(analysis())).not.toHaveProperty('connectionLost');
    });

    it('уведомление РОПу: неотработанное возражение «клиент ушёл» при обрыве не сигнал', () => {
        const objections = [
            { quote: 'Дорого', handled: false, outcome: 'disengaged' },
        ];

        expect(resolveAlertSignal(analysis({ objections }))?.kind).toBe(
            'objection_mishandled',
        );
        expect(
            resolveAlertSignal(analysis({ objections, ...lostByOutcome })),
        ).toBeNull();
    });
});

describe('toMethodologyView: признак обрыва связи', () => {
    it('connectionLost — true при исходе или сбое, false — иначе', () => {
        expect(toMethodologyView(analysis(lostByOutcome)).connectionLost).toBe(
            true,
        );
        expect(toMethodologyView(analysis(lostByIssue)).connectionLost).toBe(
            true,
        );
        expect(toMethodologyView(analysis(notLost)).connectionLost).toBe(false);
        expect(toMethodologyView(analysis()).connectionLost).toBe(false);
    });
});
