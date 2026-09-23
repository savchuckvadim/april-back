import { DEFAULT_WORK_CALENDAR } from '@lib/sales-ai-analytics';
import {
    AI_ANALYTICS_LOCAL_HOURS,
    AI_PIPELINE_CRON,
    AiLocalSlot,
    hourlyTickCron,
} from '../../constants/ai-cron.const';
import { portalHour as backfillPortalHour } from '../../pipeline/backfill.service';
import {
    dueLocalClock,
    isLocalHour,
    localClock,
    portalHour,
    resolveTimeZone,
} from '../local-hour.util';

const MOSCOW = 'Europe/Moscow';
const NOVOSIBIRSK = 'Asia/Novosibirsk';
const at = (iso: string): Date => new Date(iso);

/** Все 24 ежечасных тика суток UTC на минуте слота. */
function dayTicks(day: string, slot: AiLocalSlot): Date[] {
    return Array.from({ length: 24 }, (_, hour) =>
        at(
            `${day}T${String(hour).padStart(2, '0')}:${String(slot.minute).padStart(2, '0')}:00Z`,
        ),
    );
}

/** Часы UTC, в которые слот сработал бы на тиках суток. */
function firingUtcHours(day: string, timeZone: string, slot: AiLocalSlot) {
    return dayTicks(day, slot)
        .filter(tick => isLocalHour(tick, timeZone, slot))
        .map(tick => tick.getUTCHours());
}

describe('local-hour.util — часы портала для кронов (П10)', () => {
    it('localClock: полночь на границе дат — дата, день недели и число берутся по поясу портала', () => {
        // 07.09.2026 21:00 UTC — в Москве уже вторник 08.09 00:00.
        expect(localClock(at('2026-09-07T21:00:00Z'), MOSCOW)).toEqual({
            date: '2026-09-08',
            time: '00:00',
            hour: 0,
            minute: 0,
            weekday: 2,
            dayOfMonth: 8,
        });
        // Окленд (UTC+12 в сентябре): 12:00 UTC понедельника — уже 00:00 вторника.
        expect(
            localClock(at('2026-09-07T12:00:00Z'), 'Pacific/Auckland'),
        ).toMatchObject({
            date: '2026-09-08',
            time: '00:00',
            weekday: 2,
        });
        // Тот же момент в Москве — понедельник 15:00.
        expect(localClock(at('2026-09-07T12:00:00Z'), MOSCOW)).toMatchObject({
            date: '2026-09-07',
            time: '15:00',
            weekday: 1,
        });
    });

    it('портал без пояса или с неизвестным ICU поясом считается по Europe/Moscow', () => {
        expect(DEFAULT_WORK_CALENDAR.timeZone).toBe(MOSCOW);
        expect(resolveTimeZone(undefined)).toBe(MOSCOW);
        expect(resolveTimeZone(null)).toBe(MOSCOW);
        expect(resolveTimeZone('')).toBe(MOSCOW);
        expect(resolveTimeZone('Mars/Olympus')).toBe(MOSCOW);
        expect(resolveTimeZone(NOVOSIBIRSK)).toBe(NOVOSIBIRSK);
        // 05:00 UTC = 08:00 МСК: дайджест «пора» и без пояса, и с битым.
        const now = at('2026-09-07T05:00:00Z');
        expect(localClock(now, undefined).time).toBe('08:00');
        expect(isLocalHour(now, '', AI_ANALYTICS_LOCAL_HOURS.DIGEST)).toBe(
            true,
        );
        expect(
            isLocalHour(now, 'Mars/Olympus', AI_ANALYTICS_LOCAL_HOURS.DIGEST),
        ).toBe(true);
    });

    it('portalHour — час по поясу; backfill.service реэкспортирует ту же функцию', () => {
        expect(portalHour(at('2026-09-07T20:00:00Z'), MOSCOW)).toBe(23);
        expect(portalHour(at('2026-09-07T20:00:00Z'), NOVOSIBIRSK)).toBe(3);
        expect(backfillPortalHour).toBe(portalHour);
    });

    it('isLocalHour: окно ровно час от слота — 0 ≤ прошло < 60 минут, раньше слота никогда', () => {
        const slot = AI_ANALYTICS_LOCAL_HOURS.NIGHTLY; // 03:45
        expect(isLocalHour(at('2026-09-08T00:44:00Z'), MOSCOW, slot)).toBe(
            false,
        ); // 03:44
        expect(isLocalHour(at('2026-09-08T00:45:00Z'), MOSCOW, slot)).toBe(
            true,
        ); // 03:45
        expect(isLocalHour(at('2026-09-08T01:44:00Z'), MOSCOW, slot)).toBe(
            true,
        ); // 04:44
        expect(isLocalHour(at('2026-09-08T01:45:00Z'), MOSCOW, slot)).toBe(
            false,
        ); // 04:45
        // Запоздавший на минуту тик слот не теряет; dueLocalClock отдаёт часы для лога.
        expect(
            dueLocalClock(at('2026-09-08T00:46:00Z'), MOSCOW, slot),
        ).toMatchObject({
            date: '2026-09-08',
            time: '03:46',
        });
        expect(
            dueLocalClock(at('2026-09-08T03:00:00Z'), MOSCOW, slot),
        ).toBeNull();
    });

    it('два пояса — один слот срабатывает в разные часы UTC, ровно по разу в сутки', () => {
        const slot = AI_ANALYTICS_LOCAL_HOURS.NIGHTLY;
        // Москва UTC+3 → 00:45Z; Новосибирск UTC+7 → 20:45Z предыдущих суток UTC.
        expect(firingUtcHours('2026-09-08', MOSCOW, slot)).toEqual([0]);
        expect(firingUtcHours('2026-09-08', NOVOSIBIRSK, slot)).toEqual([20]);
        expect(
            localClock(at('2026-09-07T20:45:00Z'), NOVOSIBIRSK),
        ).toMatchObject({
            date: '2026-09-08',
            time: '03:45',
        });
    });

    it('день недели — по поясу портала: понедельник 03:15 в Окленде наступает в воскресенье UTC', () => {
        const slot = AI_ANALYTICS_LOCAL_HOURS.WEEKLY; // пн 03:15
        const sundayUtc = at('2026-09-06T15:15:00Z');
        expect(localClock(sundayUtc, 'Pacific/Auckland')).toMatchObject({
            date: '2026-09-07',
            time: '03:15',
            weekday: 1,
        });
        expect(isLocalHour(sundayUtc, 'Pacific/Auckland', slot)).toBe(true);
        expect(isLocalHour(sundayUtc, MOSCOW, slot)).toBe(false);
        // В Москве понедельник 03:15 = 00:15Z; вторник в тот же час — нет.
        expect(isLocalHour(at('2026-09-07T00:15:00Z'), MOSCOW, slot)).toBe(
            true,
        );
        expect(isLocalHour(at('2026-09-08T00:15:00Z'), MOSCOW, slot)).toBe(
            false,
        );
    });

    it('число месяца — по поясу портала: заморозка 3-го 04:00 и планы 1-го 04:00', () => {
        const monthly = AI_ANALYTICS_LOCAL_HOURS.MONTHLY;
        expect(isLocalHour(at('2026-10-03T01:00:00Z'), MOSCOW, monthly)).toBe(
            true,
        );
        expect(isLocalHour(at('2026-10-04T01:00:00Z'), MOSCOW, monthly)).toBe(
            false,
        );
        // 02.10 21:00Z: в Москве 3-е 00:00 (час не тот), в Новосибирске 3-е 04:00.
        expect(isLocalHour(at('2026-10-02T21:00:00Z'), MOSCOW, monthly)).toBe(
            false,
        );
        expect(
            isLocalHour(at('2026-10-02T21:00:00Z'), NOVOSIBIRSK, monthly),
        ).toBe(true);
        const plans = AI_ANALYTICS_LOCAL_HOURS.PLANS;
        expect(isLocalHour(at('2026-09-01T01:00:00Z'), MOSCOW, plans)).toBe(
            true,
        );
        expect(isLocalHour(at('2026-09-03T01:00:00Z'), MOSCOW, plans)).toBe(
            false,
        );
    });

    it('перевод часов у портала не в РФ: в сутки перехода слот срабатывает ровно один раз', () => {
        const slot = AI_ANALYTICS_LOCAL_HOURS.NIGHTLY; // 03:45
        // Берлин, 29.03.2026: 02:00 CET → 03:00 CEST. 00:45Z ещё 01:45 CET, 01:45Z уже 03:45 CEST.
        expect(firingUtcHours('2026-03-29', 'Europe/Berlin', slot)).toEqual([
            1,
        ]);
        expect(
            localClock(at('2026-03-29T00:45:00Z'), 'Europe/Berlin').time,
        ).toBe('01:45');
        expect(
            localClock(at('2026-03-29T01:45:00Z'), 'Europe/Berlin').time,
        ).toBe('03:45');
        // Берлин, 25.10.2026: 03:00 CEST → 02:00 CET — 02:45 повторяется дважды, 03:45 наступает в 02:45Z.
        expect(firingUtcHours('2026-10-25', 'Europe/Berlin', slot)).toEqual([
            2,
        ]);
        expect(
            localClock(at('2026-10-25T00:45:00Z'), 'Europe/Berlin').time,
        ).toBe('02:45');
        expect(
            localClock(at('2026-10-25T01:45:00Z'), 'Europe/Berlin').time,
        ).toBe('02:45');
        // Обычные сутки — тоже один раз, в 01:45Z (CEST).
        expect(firingUtcHours('2026-07-15', 'Europe/Berlin', slot)).toEqual([
            1,
        ]);
    });

    it('дробное смещение (+5:30): джоба уходит первым тиком после слота, не раньше', () => {
        const slot = AI_ANALYTICS_LOCAL_HOURS.DIGEST; // 08:00, тик на :00
        // 02:00Z = 07:30 Калькутты (рано), 03:00Z = 08:30 (пора), 04:00Z = 09:30 (поздно).
        expect(firingUtcHours('2026-09-07', 'Asia/Kolkata', slot)).toEqual([3]);
        expect(
            localClock(at('2026-09-07T03:00:00Z'), 'Asia/Kolkata').time,
        ).toBe('08:30');
    });

    it('hourlyTickCron: ежечасный тик на минуте слота — расписания конвейера из слотов', () => {
        expect(hourlyTickCron({ hour: 3, minute: 45 })).toBe('45 * * * *');
        expect(hourlyTickCron({ hour: 8, minute: 0 })).toBe('0 * * * *');
        expect(AI_PIPELINE_CRON).toEqual({
            NIGHTLY: hourlyTickCron(AI_ANALYTICS_LOCAL_HOURS.NIGHTLY),
            WEEKLY: hourlyTickCron(AI_ANALYTICS_LOCAL_HOURS.WEEKLY),
            MONTHLY: hourlyTickCron(AI_ANALYTICS_LOCAL_HOURS.MONTHLY),
            PLANS: hourlyTickCron(AI_ANALYTICS_LOCAL_HOURS.PLANS),
        });
    });
});
