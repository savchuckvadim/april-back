import { splitIntoMonthSegments } from '../domain/calc/month-segments.util';

describe('splitIntoMonthSegments', () => {
    const now = new Date(2026, 6, 24); // 24.07.2026

    it('полные прошлые месяцы кэшируемы, границы точны', () => {
        const segments = splitIntoMonthSegments(
            '2026-01-01',
            '2026-03-31',
            now,
        );
        expect(segments).toEqual([
            {
                from: '2026-01-01',
                to: '2026-01-31',
                month: '2026-01',
                cacheable: true,
            },
            {
                from: '2026-02-01',
                to: '2026-02-28',
                month: '2026-02',
                cacheable: true,
            },
            {
                from: '2026-03-01',
                to: '2026-03-31',
                month: '2026-03',
                cacheable: true,
            },
        ]);
    });

    it('неполный краевой сегмент не кэшируется', () => {
        const segments = splitIntoMonthSegments(
            '2026-01-15',
            '2026-02-28',
            now,
        );
        expect(segments[0]).toMatchObject({
            from: '2026-01-15',
            to: '2026-01-31',
            cacheable: false,
        });
        expect(segments[1]).toMatchObject({ cacheable: true });
    });

    it('текущий месяц не кэшируется даже целиком', () => {
        const segments = splitIntoMonthSegments(
            '2026-07-01',
            '2026-07-31',
            now,
        );
        expect(segments).toHaveLength(1);
        expect(segments[0].cacheable).toBe(false);
    });

    it('диапазон в один день — один некэшируемый сегмент', () => {
        const segments = splitIntoMonthSegments(
            '2026-03-10',
            '2026-03-10',
            now,
        );
        expect(segments).toEqual([
            {
                from: '2026-03-10',
                to: '2026-03-10',
                month: '2026-03',
                cacheable: false,
            },
        ]);
    });

    it('переход через год', () => {
        const segments = splitIntoMonthSegments(
            '2025-12-01',
            '2026-01-31',
            now,
        );
        expect(segments.map(segment => segment.month)).toEqual([
            '2025-12',
            '2026-01',
        ]);
        expect(segments.every(segment => segment.cacheable)).toBe(true);
    });

    it('from > to даёт пустой массив', () => {
        expect(splitIntoMonthSegments('2026-05-01', '2026-04-01', now)).toEqual(
            [],
        );
    });
});
