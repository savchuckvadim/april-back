import {
    dateKeyOf,
    monthKeyOf,
    monthWindow,
    windowLowerBound,
} from '../audit/ai-analytics-audit.time';

describe('ai-analytics-audit.time', () => {
    const lateEvening = new Date('2026-08-31T22:30:00Z');

    it('monthKeyOf учитывает часовой пояс на границе месяца', () => {
        expect(monthKeyOf(lateEvening, 'Europe/Moscow')).toBe('2026-09');
        expect(monthKeyOf(lateEvening, 'UTC')).toBe('2026-08');
    });

    it('dateKeyOf даёт YYYY-MM-DD в часовом поясе', () => {
        expect(dateKeyOf(lateEvening, 'Europe/Moscow')).toBe('2026-09-01');
        expect(dateKeyOf(lateEvening, 'UTC')).toBe('2026-08-31');
    });

    it('monthWindow возвращает N последних месяцев через границу года', () => {
        const now = new Date('2026-02-15T12:00:00Z');
        expect(monthWindow(now, 3, 'UTC')).toEqual([
            '2025-12',
            '2026-01',
            '2026-02',
        ]);
        expect(monthWindow(now, 1, 'UTC')).toEqual(['2026-02']);
    });

    it('monthWindow берёт текущий месяц по часовому поясу', () => {
        expect(monthWindow(lateEvening, 2, 'Europe/Moscow')).toEqual([
            '2026-08',
            '2026-09',
        ]);
    });

    it('windowLowerBound — начало первого месяца минус сутки (UTC)', () => {
        expect(windowLowerBound('2026-01').toISOString()).toBe(
            '2025-12-31T00:00:00.000Z',
        );
    });
});
