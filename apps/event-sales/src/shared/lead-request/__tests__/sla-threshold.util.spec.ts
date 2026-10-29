import {
    SLA_MAX_AGE_DAYS,
    SLA_MIN_MINUTES,
    slaNotBefore,
    slaThresholdMinutes,
} from '../sla-threshold.util';

describe('sla-threshold.util', () => {
    it('порог: меньше часа и мусор поднимаются до часа', () => {
        expect(slaThresholdMinutes(10)).toBe(SLA_MIN_MINUTES);
        expect(slaThresholdMinutes(null)).toBe(SLA_MIN_MINUTES);
        expect(slaThresholdMinutes(Number.NaN)).toBe(SLA_MIN_MINUTES);
        expect(slaThresholdMinutes(90)).toBe(90);
    });

    /*
     * Решение владельца 29.10.2026: назначенное больше 3 дней назад —
     * забытый хвост, SLA его не трогает. Дни календарные.
     */
    it('давность: граница ровно на 3 календарных дня раньше', () => {
        expect(SLA_MAX_AGE_DAYS).toBe(3);
        const now = new Date('2026-10-29T16:00:00+03:00');
        expect(slaNotBefore(now).toISOString()).toBe(
            new Date('2026-10-26T16:00:00+03:00').toISOString(),
        );
    });
});
