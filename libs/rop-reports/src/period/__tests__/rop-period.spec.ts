import { ETimeZone } from '@lib/shared/lib/date';
import {
    isoWeekdayOf,
    isRopPeriodKind,
    lastClosedRopPeriod,
    previousRopPeriod,
    ROP_PERIOD_KIND,
    ROP_PERIOD_KINDS,
    ropPeriodByKey,
    ropPeriodKey,
    ropPeriodOf,
    ropPeriodWindow,
    ropPortalDay,
    ropPortalHour,
    sameRopPeriodYearAgo,
    shiftRopDay,
} from '../rop-period';

const { week, month, quarter, halfYear, year } = ROP_PERIOD_KIND;

describe('периоды отчётов РОПу', () => {
    describe('календарная ISO-неделя', () => {
        it('вторник 17.11.2026 — неделя 47, с понедельника по воскресенье', () => {
            expect(ropPeriodOf(week, '2026-11-17')).toEqual({
                kind: week,
                key: '2026-W47',
                from: '2026-11-16',
                to: '2026-11-22',
                label: '16.11–22.11',
            });
        });

        it('год недели — год её четверга: 29.12.2025 уже первая неделя 2026', () => {
            expect(ropPeriodKey(week, '2025-12-29')).toBe('2026-W01');
            expect(ropPeriodByKey(week, '2026-W01')).toMatchObject({
                from: '2025-12-29',
                to: '2026-01-04',
                label: '29.12–04.01',
            });
        });

        it('53-я неделя есть только у длинного года', () => {
            expect(ropPeriodKey(week, '2026-12-31')).toBe('2026-W53');
            expect(ropPeriodKey(week, '2027-01-01')).toBe('2026-W53');
            expect(ropPeriodKey(week, '2027-01-04')).toBe('2027-W01');
            expect(ropPeriodByKey(week, '2025-W53')).toBeNull();
            expect(ropPeriodByKey(week, '2026-W00')).toBeNull();
        });

        it('прошлая неделя через границу года', () => {
            const previous = previousRopPeriod(ropPeriodOf(week, '2026-01-02'));
            expect(previous).toMatchObject({
                key: '2025-W52',
                from: '2025-12-22',
                to: '2025-12-28',
            });
        });

        it('у недели нет пары «год назад»', () => {
            expect(sameRopPeriodYearAgo(ropPeriodOf(week, '2026-11-17'))).toBe(
                null,
            );
        });
    });

    describe('месяц и длинные периоды', () => {
        it('месяц: границы, подпись, високосный февраль', () => {
            expect(ropPeriodOf(month, '2026-02-15')).toEqual({
                kind: month,
                key: '2026-02',
                from: '2026-02-01',
                to: '2026-02-28',
                label: 'февраль 2026',
            });
            expect(ropPeriodOf(month, '2028-02-10').to).toBe('2028-02-29');
        });

        it('квартал, полугодие, год', () => {
            expect(ropPeriodOf(quarter, '2026-11-17')).toEqual({
                kind: quarter,
                key: '2026-Q4',
                from: '2026-10-01',
                to: '2026-12-31',
                label: '4 квартал 2026',
            });
            expect(ropPeriodOf(halfYear, '2026-07-01')).toMatchObject({
                key: '2026-H2',
                from: '2026-07-01',
                to: '2026-12-31',
                label: '2 полугодие 2026',
            });
            expect(ropPeriodOf(year, '2026-03-03')).toMatchObject({
                key: '2026',
                from: '2026-01-01',
                to: '2026-12-31',
                label: '2026 год',
            });
        });

        it('прошлый и последний закрытый период', () => {
            expect(
                previousRopPeriod(ropPeriodOf(month, '2026-01-20')).key,
            ).toBe('2025-12');
            expect(
                previousRopPeriod(ropPeriodOf(quarter, '2026-02-01')).key,
            ).toBe('2025-Q4');
            expect(lastClosedRopPeriod(month, '2026-12-01').key).toBe(
                '2026-11',
            );
        });

        it('тот же период год назад', () => {
            expect(
                sameRopPeriodYearAgo(ropPeriodOf(month, '2026-02-10')),
            ).toMatchObject({ key: '2025-02', to: '2025-02-28' });
            expect(
                sameRopPeriodYearAgo(ropPeriodOf(halfYear, '2026-08-01'))?.key,
            ).toBe('2025-H2');
            expect(
                sameRopPeriodYearAgo(ropPeriodOf(year, '2026-05-05'))?.key,
            ).toBe('2025');
        });

        it('чужой ключ — null', () => {
            expect(ropPeriodByKey(month, '2026-13')).toBeNull();
            expect(ropPeriodByKey(quarter, '2026-Q5')).toBeNull();
            expect(ropPeriodByKey(year, '26')).toBeNull();
        });
    });

    describe('таймзона портала', () => {
        it('моменты начала и конца месяца — полночи по времени портала', () => {
            const november = ropPeriodOf(month, '2026-11-17');
            const moscow = ropPeriodWindow(november, ETimeZone.EUROPE_MOSCOW);
            expect(moscow.fromAt.toISOString()).toBe(
                '2026-10-31T21:00:00.000Z',
            );
            expect(moscow.toAt.toISOString()).toBe('2026-11-30T21:00:00.000Z');
            const novosibirsk = ropPeriodWindow(
                november,
                ETimeZone.ASIA_NOVOSIBIRSK,
            );
            expect(novosibirsk.fromAt.toISOString()).toBe(
                '2026-10-31T17:00:00.000Z',
            );
            expect(novosibirsk.key).toBe('2026-11');
        });

        it('день и час портала, а не сервера', () => {
            const now = new Date('2026-11-16T22:30:00.000Z');
            expect(ropPortalDay(now, ETimeZone.EUROPE_MOSCOW)).toBe(
                '2026-11-17',
            );
            expect(ropPortalHour(now, ETimeZone.EUROPE_MOSCOW)).toBe(1);
        });
    });

    describe('дни', () => {
        it('сдвиг и день недели', () => {
            expect(shiftRopDay('2026-02-28', 1)).toBe('2026-03-01');
            expect(shiftRopDay('2026-01-01', -1)).toBe('2025-12-31');
            expect(isoWeekdayOf('2026-11-16')).toBe(1);
            expect(isoWeekdayOf('2026-11-22')).toBe(7);
        });

        it('не календарный день — ошибка, а не тихий сдвиг', () => {
            expect(() => shiftRopDay('2026-02-30', 1)).toThrow(RangeError);
            expect(() => ropPeriodKey(month, '17.11.2026')).toThrow(RangeError);
        });
    });

    it('справочник видов и проверка кода', () => {
        expect(ROP_PERIOD_KINDS).toEqual([
            'week',
            'month',
            'quarter',
            'half_year',
            'year',
        ]);
        expect(isRopPeriodKind('month')).toBe(true);
        expect(isRopPeriodKind('day')).toBe(false);
        expect(isRopPeriodKind(1)).toBe(false);
    });
});
