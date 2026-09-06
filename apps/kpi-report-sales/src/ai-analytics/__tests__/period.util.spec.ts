import {
    dayEndUtc,
    dayStartUtc,
    isoWeekKey,
    portalRangeUtc,
    weekMondayOf,
} from '../domain/loaders/period.util';

describe('period.util (границы периодов в TZ портала)', () => {
    it('начало дня портала → UTC с учётом смещения TZ', () => {
        expect(dayStartUtc('2026-09-04', 'Europe/Moscow').toISOString()).toBe(
            '2026-09-03T21:00:00.000Z',
        );
        expect(dayStartUtc('2026-09-04', 'UTC').toISOString()).toBe(
            '2026-09-04T00:00:00.000Z',
        );
    });

    it('конец дня — миллисекунда до следующего дня', () => {
        expect(dayEndUtc('2026-09-04', 'Europe/Moscow').toISOString()).toBe(
            '2026-09-04T20:59:59.999Z',
        );
    });

    it('диапазон дней включает обе границы', () => {
        const { from, to } = portalRangeUtc(
            '2026-08-31',
            '2026-09-04',
            'Europe/Moscow',
        );
        expect(from.toISOString()).toBe('2026-08-30T21:00:00.000Z');
        expect(to.toISOString()).toBe('2026-09-04T20:59:59.999Z');
    });

    it('понедельник ISO-недели', () => {
        expect(weekMondayOf('2026-09-05')).toBe('2026-08-31'); // сб
        expect(weekMondayOf('2026-08-31')).toBe('2026-08-31'); // пн
        expect(weekMondayOf('2026-09-06')).toBe('2026-08-31'); // вс
    });

    it('ключ ISO-недели, включая переход года', () => {
        expect(isoWeekKey('2026-09-05')).toBe('2026-W36');
        expect(isoWeekKey('2026-08-31')).toBe('2026-W36');
        expect(isoWeekKey('2027-01-01')).toBe('2026-W53');
        expect(isoWeekKey('2026-01-01')).toBe('2026-W01');
    });
});
