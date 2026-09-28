import {
    formatRuDate,
    formatRuDateRange,
    formatRuDayMonth,
    formatRuWeekSince,
    isIsoWeekKey,
    mondayOfIsoWeek,
} from '../model/iso-week.util';
import { isoWeekday } from '../model/workdays.util';

describe('mondayOfIsoWeek', () => {
    it('ключ недели → понедельник этой недели', () => {
        // 4 января 2026 — воскресенье, W01 начинается 29 декабря 2025.
        expect(mondayOfIsoWeek('2026-W01')).toBe('2025-12-29');
        expect(mondayOfIsoWeek('2026-W31')).toBe('2026-07-27');
        expect(mondayOfIsoWeek('2026-W36')).toBe('2026-08-31');
        expect(mondayOfIsoWeek('2024-W09')).toBe('2024-02-26');
        for (const key of ['2026-W01', '2026-W53', '2024-W09']) {
            expect(isoWeekday(mondayOfIsoWeek(key))).toBe(1);
        }
    });

    it('isIsoWeekKey принимает только YYYY-Www', () => {
        expect(isIsoWeekKey('2026-W36')).toBe(true);
        expect(isIsoWeekKey('2026-36')).toBe(false);
        expect(isIsoWeekKey('week')).toBe(false);
    });
});

describe('русские даты для текстов', () => {
    it('день и месяц в родительном падеже, год по запросу', () => {
        expect(formatRuDayMonth('2026-07-27')).toBe('27 июля');
        expect(formatRuDate('2026-09-01')).toBe('1 сентября 2026');
        expect(formatRuDayMonth('не дата')).toBe('не дата');
        expect(formatRuDate('2026-13-01')).toBe('2026-13-01');
    });

    it('период: один месяц, разные месяцы, разные годы, одна дата', () => {
        expect(formatRuDateRange('2026-09-01', '2026-09-28')).toBe(
            '1–28 сентября 2026',
        );
        expect(formatRuDateRange('2026-08-25', '2026-09-28')).toBe(
            '25 августа – 28 сентября 2026',
        );
        expect(formatRuDateRange('2025-12-25', '2026-01-05')).toBe(
            '25 декабря 2025 – 5 января 2026',
        );
        expect(formatRuDateRange('2026-09-28', '2026-09-28')).toBe(
            '28 сентября 2026',
        );
        expect(formatRuDateRange('x', '2026-09-28')).toBe('x — 2026-09-28');
    });

    it('«с недели 27 июля» по ключу; не ключ — как есть', () => {
        expect(formatRuWeekSince('2026-W31')).toBe('с недели 27 июля');
        expect(formatRuWeekSince('2026-W27')).toBe('с недели 29 июня');
        expect(formatRuWeekSince('позавчера')).toBe('с недели позавчера');
    });
});
