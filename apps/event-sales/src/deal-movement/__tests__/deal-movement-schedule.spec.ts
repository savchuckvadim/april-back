import { ETimeZone } from '@lib/shared/lib/date';
import {
    dealMovementDayKey,
    isDealMovementDue,
    isDealMovementStateStale,
    parseDealMovementLastRun,
} from '../lib/deal-movement-schedule';

const MSK = ETimeZone.EUROPE_MOSCOW;

describe('календарь движения сделок', () => {
    it('день — по часам портала', () => {
        // 22:30 UTC 17.11 = 01:30 МСК 18.11.
        expect(dealMovementDayKey(new Date('2026-11-17T22:30:00Z'), MSK)).toBe(
            '2026-11-18',
        );
    });

    it('пора — только ночью с 02:00 до 05:00 по часам портала и раз в сутки', () => {
        const at0227 = new Date('2026-11-17T23:27:00Z'); // 02:27 МСК
        expect(isDealMovementDue({ now: at0227, tz: MSK, lastDay: null })).toBe(
            true,
        );
        expect(
            isDealMovementDue({ now: at0227, tz: MSK, lastDay: '2026-11-17' }),
        ).toBe(true);
        expect(
            isDealMovementDue({ now: at0227, tz: MSK, lastDay: '2026-11-18' }),
        ).toBe(false);
        // 01:27 и 05:27 МСК — не ночь счёта.
        expect(
            isDealMovementDue({
                now: new Date('2026-11-17T22:27:00Z'),
                tz: MSK,
                lastDay: null,
            }),
        ).toBe(false);
        expect(
            isDealMovementDue({
                now: new Date('2026-11-18T02:27:00Z'),
                tz: MSK,
                lastDay: null,
            }),
        ).toBe(false);
    });

    it('состояние устарело: счёта нет или он старше трёх суток', () => {
        const now = new Date('2026-11-18T00:00:00Z');
        expect(isDealMovementStateStale(null, now)).toBe(true);
        expect(isDealMovementStateStale('мусор', now)).toBe(true);
        expect(isDealMovementStateStale('2026-11-17T00:00:00Z', now)).toBe(
            false,
        );
        expect(isDealMovementStateStale('2026-11-14T23:00:00Z', now)).toBe(
            true,
        );
    });

    it('метка последнего счёта: чужая форма — null', () => {
        expect(
            parseDealMovementLastRun(
                '{"day":"2026-11-18","at":"2026-11-17T23:30:00Z"}',
            ),
        ).toEqual({ day: '2026-11-18', at: '2026-11-17T23:30:00Z' });
        expect(parseDealMovementLastRun('{"day":5}')).toBeNull();
        expect(parseDealMovementLastRun('{не json')).toBeNull();
        expect(parseDealMovementLastRun(null)).toBeNull();
    });
});
