import { hasManagerSignal, signalViewOf } from '../steps/sanity.signal';

/**
 * Обрыв связи — не вина менеджера (26.11.2026): строка шины с отмеченным
 * обрывом (исход или сбой «связь прервалась» в report) считается тем же
 * правилом сигнала, что пульс и уведомление РОПу, — без «дверь закрыта» и
 * без причины «клиент ушёл». Чужая форма report не роняет панель.
 */
const row = (report: unknown): Record<string, unknown> => ({
    riskFlags: ['door_closed'],
    riskEvidence: [{ flag: 'door_closed', quote: 'Ладно, до свидания' }],
    objections: [],
    sections: [],
    report,
});

describe('signalViewOf: признак обрыва связи в строке шины', () => {
    it('исход «связь прервалась» и сбой «связь прервалась» дают connectionLost', () => {
        expect(
            signalViewOf(row({ outcome: 'connection_lost', issues: [] }))
                .connectionLost,
        ).toBe(true);
        expect(
            signalViewOf(
                row({
                    outcome: 'postponed',
                    issues: [{ code: 'connection_lost', quote: null }],
                }),
            ).connectionLost,
        ).toBe(true);
    });

    it('без обрыва, без report и при чужой форме report признака нет', () => {
        for (const report of [
            { outcome: 'refused', issues: [{ code: 'telephony' }] },
            undefined,
            null,
            'мусор',
            { issues: 'не список' },
        ]) {
            expect(signalViewOf(row(report))).not.toHaveProperty(
                'connectionLost',
            );
        }
    });
});

describe('hasManagerSignal: «дверь закрыта» при обрыве связи', () => {
    it('без обрыва флаг с цитатой — сигнал, при обрыве — нет', () => {
        expect(hasManagerSignal(row({ outcome: 'refused' }))).toBe(true);
        expect(hasManagerSignal(row({ outcome: 'connection_lost' }))).toBe(
            false,
        );
    });
});
