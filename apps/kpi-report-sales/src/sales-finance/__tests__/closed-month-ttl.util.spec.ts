import {
    closedMonthTtlSeconds,
    isRecentClosedMonth,
} from '../cache/closed-month-ttl.util';
import {
    SALES_FINANCE_PAST_MONTH_TTL_SECONDS,
    SALES_FINANCE_RECENT_CLOSED_MONTHS,
    SALES_FINANCE_RECENT_MONTH_TTL_SECONDS,
} from '../constants/sales-finance.const';

/** 30.09.2026 — закрыты август (1) и июль (2). */
const NOW = new Date(2026, 8, 30, 12, 0, 0);

describe('closed-month-ttl.util', () => {
    it('недавние — два последних закрытых месяца', () => {
        expect(SALES_FINANCE_RECENT_CLOSED_MONTHS).toBe(2);
        expect(isRecentClosedMonth('2026-08', NOW)).toBe(true);
        expect(isRecentClosedMonth('2026-07', NOW)).toBe(true);
        expect(isRecentClosedMonth('2026-06', NOW)).toBe(false);
    });

    it('текущий и будущий месяц — не закрытые', () => {
        expect(isRecentClosedMonth('2026-09', NOW)).toBe(false);
        expect(isRecentClosedMonth('2026-10', NOW)).toBe(false);
    });

    it('переход через год: в январе закрыты декабрь и ноябрь', () => {
        const january = new Date(2027, 0, 5);
        expect(isRecentClosedMonth('2026-12', january)).toBe(true);
        expect(isRecentClosedMonth('2026-11', january)).toBe(true);
        expect(isRecentClosedMonth('2026-10', january)).toBe(false);
    });

    it('нераспознанный месяц — не недавний', () => {
        expect(isRecentClosedMonth('2026-8', NOW)).toBe(false);
        expect(isRecentClosedMonth('', NOW)).toBe(false);
    });

    it('TTL: недавний закрытый — сутки, старше — 30 дней', () => {
        expect(closedMonthTtlSeconds('2026-08', NOW)).toBe(
            SALES_FINANCE_RECENT_MONTH_TTL_SECONDS,
        );
        expect(SALES_FINANCE_RECENT_MONTH_TTL_SECONDS).toBe(24 * 3600);
        expect(closedMonthTtlSeconds('2026-05', NOW)).toBe(
            SALES_FINANCE_PAST_MONTH_TTL_SECONDS,
        );
        expect(SALES_FINANCE_PAST_MONTH_TTL_SECONDS).toBe(30 * 24 * 3600);
    });
});
