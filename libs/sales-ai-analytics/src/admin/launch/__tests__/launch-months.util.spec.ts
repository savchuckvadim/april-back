import { closedMonthKeys, missingMonthsText } from '../launch-months.util';

describe('closedMonthKeys — окно кнопки «Догнать историю»', () => {
    it('24 закрытых месяца перед месяцем «сегодня», от старых к свежим', () => {
        const months = closedMonthKeys(
            new Date('2026-10-21T09:00:00.000Z'),
            'Europe/Moscow',
            24,
        );
        expect(months).toHaveLength(24);
        expect(months[0]).toBe('2024-10');
        expect(months[23]).toBe('2026-09');
    });

    it('граница месяца — в поясе портала, а не в UTC', () => {
        // 31.10 23:30 UTC = 01.11 02:30 МСК: для портала уже ноябрь.
        const months = closedMonthKeys(
            new Date('2026-10-31T23:30:00.000Z'),
            'Europe/Moscow',
            2,
        );
        expect(months).toEqual(['2026-09', '2026-10']);
    });
});

describe('missingMonthsText — каких месяцев не хватает', () => {
    it('до шести месяцев — списком, дальше «и ещё N», пусто — пустая строка', () => {
        expect(missingMonthsText(['2026-04', '2026-05'])).toBe(
            '2026-04, 2026-05',
        );
        expect(
            missingMonthsText([
                '2025-08',
                '2025-09',
                '2025-10',
                '2025-11',
                '2025-12',
                '2026-01',
                '2026-02',
                '2026-03',
            ]),
        ).toBe('2025-08, 2025-09, 2025-10, 2025-11, 2025-12, 2026-01 и ещё 2');
        expect(missingMonthsText([])).toBe('');
    });
});
