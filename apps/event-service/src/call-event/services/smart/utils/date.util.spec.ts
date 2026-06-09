import { compareDates, getFirstLastDayOfMonth } from './date.util';

describe('date.util', () => {
    describe('getFirstLastDayOfMonth', () => {
        it('возвращает границы месяца в ISO', () => {
            const [first, last] = getFirstLastDayOfMonth(
                new Date('2026-06-15T12:00:00+03:00'),
            );
            expect(first).toBe('2026-06-01T00:00:00');
            expect(last).toBe('2026-06-30T23:59:59');
        });
    });

    describe('compareDates', () => {
        it('reverse=true возвращает более позднюю дату', () => {
            expect(
                compareDates(
                    '10.06.2026 10:00:00',
                    '12.06.2026 10:00:00',
                    true,
                ),
            ).toBe('12.06.2026 10:00:00');
        });

        it('reverse=true с невалидной первой датой возвращает вторую', () => {
            expect(compareDates('', '12.06.2026 10:00:00', true)).toBe(
                '12.06.2026 10:00:00',
            );
        });

        it('reverse=true с невалидной второй датой возвращает первую', () => {
            expect(compareDates('10.06.2026 10:00:00', '', true)).toBe(
                '10.06.2026 10:00:00',
            );
        });
    });
});
