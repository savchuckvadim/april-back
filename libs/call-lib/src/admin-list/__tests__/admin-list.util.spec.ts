import {
    adminPageBounds,
    facetValues,
    moscowDayRange,
    moscowDayStart,
    numberOrNull,
} from '../admin-list.util';

const LIMITS = { defaultPageSize: 50, maxPageSize: 200 };

describe('admin-list.util — общие правила списков админки', () => {
    it('страница и размер: дефолты, нижняя и верхняя границы, дробные — вниз', () => {
        expect(adminPageBounds({}, LIMITS)).toEqual({ page: 1, pageSize: 50 });
        expect(adminPageBounds({ page: 0, pageSize: 0 }, LIMITS)).toEqual({
            page: 1,
            pageSize: 1,
        });
        expect(
            adminPageBounds({ page: 3.7, pageSize: 10_000 }, LIMITS),
        ).toEqual({ page: 3, pageSize: 200 });
    });

    it('день по Москве — полночь МСК в UTC; кривой день — null', () => {
        expect(moscowDayStart('2026-11-13')?.toISOString()).toBe(
            '2026-11-12T21:00:00.000Z',
        );
        expect(moscowDayStart('13.11.2026')).toBeNull();
        expect(moscowDayStart(undefined)).toBeNull();
    });

    it('период «с дня по день» включает последний день целиком', () => {
        expect(moscowDayRange('2026-11-01', '2026-11-30')).toEqual({
            gte: new Date('2026-10-31T21:00:00.000Z'),
            lt: new Date('2026-11-30T21:00:00.000Z'),
        });
        expect(moscowDayRange(undefined, '2026-11-01')).toEqual({
            lt: new Date('2026-11-01T21:00:00.000Z'),
        });
        expect(moscowDayRange(undefined, undefined)).toBeUndefined();
        expect(moscowDayRange('мусор', '')).toBeUndefined();
    });

    it('значения фильтра: без пустых, частые первыми, при равенстве — по алфавиту', () => {
        expect(
            facetValues([
                { value: 'b', count: 2 },
                { value: null, count: 99 },
                { value: '  ', count: 50 },
                { value: 'a', count: 2 },
                { value: 'c', count: 7 },
            ]),
        ).toEqual([
            { value: 'c', count: 7 },
            { value: 'a', count: 2 },
            { value: 'b', count: 2 },
        ]);
    });

    it('число из строковой колонки: пусто и мусор — null', () => {
        expect(numberOrNull('734')).toBe(734);
        expect(numberOrNull('12.5')).toBe(12.5);
        expect(numberOrNull('')).toBeNull();
        expect(numberOrNull(null)).toBeNull();
        expect(numberOrNull('abc')).toBeNull();
    });
});
