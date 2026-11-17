import { ETimeZone } from '@lib/shared/lib/date';
import { isoWeekdayOf, ropPeriodOf, ROP_PERIOD_KIND } from '../rop-period';
import {
    firstWorkdayDue,
    firstWorkdayOf,
    RopDuePolicy,
    RopWorkdayCalendar,
    weeklyDue,
} from '../rop-schedule';

/** Пятидневка и праздники РФ начала 2026 года (1–8 января). */
const HOLIDAYS = [
    '2026-01-01',
    '2026-01-02',
    '2026-01-05',
    '2026-01-06',
    '2026-01-07',
    '2026-01-08',
];

const calendar = (holidays: readonly string[] = []): RopWorkdayCalendar => ({
    isWorkday: day => isoWeekdayOf(day) <= 5 && !holidays.includes(day),
});

const NO_WORKDAYS: RopWorkdayCalendar = { isWorkday: () => false };

const dueAt = (
    policy: RopDuePolicy,
    iso: string,
    cal: RopWorkdayCalendar = calendar(HOLIDAYS),
    timezone: ETimeZone = ETimeZone.EUROPE_MOSCOW,
): string | null =>
    policy.due({ now: new Date(iso), timezone, calendar: cal })?.key ?? null;

describe('расписание отчётов РОПу', () => {
    describe('еженедельно: понедельник 9:00 по времени портала', () => {
        const monday = weeklyDue({ weekday: 1, hour: 9, workdaysOnly: true });

        it('в понедельник с 9:00 — прошлая календарная неделя', () => {
            expect(monday.kind).toBe(ROP_PERIOD_KIND.week);
            // 16.11.2026 — понедельник; 06:00Z = 09:00 МСК.
            expect(dueAt(monday, '2026-11-16T05:59:00Z')).toBeNull();
            expect(dueAt(monday, '2026-11-16T06:00:00Z')).toBe('2026-W46');
        });

        it('догон до конца недели, но не ночью', () => {
            expect(dueAt(monday, '2026-11-17T00:00:00Z')).toBeNull();
            expect(dueAt(monday, '2026-11-18T07:00:00Z')).toBe('2026-W46');
        });

        it('только рабочие дни: в воскресенье не выпускается; без этого правила — выпускается', () => {
            expect(dueAt(monday, '2026-11-22T07:00:00Z')).toBeNull();
            const anyDay = weeklyDue({
                weekday: 1,
                hour: 9,
                workdaysOnly: false,
            });
            expect(dueAt(anyDay, '2026-11-22T07:00:00Z')).toBe('2026-W46');
        });

        it('праздничный понедельник — в первый рабочий день недели', () => {
            // 05.01.2026 — понедельник в праздниках, 09.01 — первый рабочий.
            expect(dueAt(monday, '2026-01-05T07:00:00Z')).toBeNull();
            expect(dueAt(monday, '2026-01-09T06:00:00Z')).toBe('2026-W01');
        });

        it('до дня выпуска на неделе — рано', () => {
            const wednesday = weeklyDue({
                weekday: 3,
                hour: 9,
                workdaysOnly: true,
            });
            expect(dueAt(wednesday, '2026-11-16T07:00:00Z')).toBeNull();
            expect(dueAt(wednesday, '2026-11-18T07:00:00Z')).toBe('2026-W46');
        });

        it('час — по таймзоне портала, а не сервера', () => {
            // 02:00Z — 09:00 в Новосибирске и 05:00 в Москве.
            const at = '2026-11-16T02:00:00Z';
            expect(
                dueAt(monday, at, calendar(), ETimeZone.ASIA_NOVOSIBIRSK),
            ).toBe('2026-W46');
            expect(dueAt(monday, at, calendar(), ETimeZone.EUROPE_MOSCOW)).toBe(
                null,
            );
        });

        it('мусор в настройке — ошибка сразу, а не тихий выпуск', () => {
            expect(() =>
                weeklyDue({ weekday: 0, hour: 9, workdaysOnly: true }),
            ).toThrow(RangeError);
            expect(() =>
                weeklyDue({ weekday: 1, hour: 24, workdaysOnly: true }),
            ).toThrow(RangeError);
        });
    });

    describe('ежемесячно: первый рабочий день месяца с 9:00', () => {
        const monthly = firstWorkdayDue({
            kind: ROP_PERIOD_KIND.month,
            hour: 9,
        });

        it('1 декабря 2026 (вторник) с 9:00 — ноябрь', () => {
            expect(monthly.kind).toBe(ROP_PERIOD_KIND.month);
            expect(dueAt(monthly, '2026-12-01T05:00:00Z')).toBeNull();
            expect(dueAt(monthly, '2026-12-01T06:00:00Z')).toBe('2026-11');
        });

        it('январь: первый рабочий день после праздников, затем догон по рабочим дням', () => {
            expect(dueAt(monthly, '2026-01-05T07:00:00Z')).toBeNull();
            expect(dueAt(monthly, '2026-01-09T05:00:00Z')).toBeNull();
            expect(dueAt(monthly, '2026-01-09T06:00:00Z')).toBe('2025-12');
            // 10.01 — суббота: задачу в выходной не ставим.
            expect(dueAt(monthly, '2026-01-10T07:00:00Z')).toBeNull();
            expect(dueAt(monthly, '2026-01-12T07:00:00Z')).toBe('2025-12');
        });

        it('догон до конца месяца: решает метка выпуска, а не политика', () => {
            expect(dueAt(monthly, '2026-11-30T07:00:00Z')).toBe('2026-10');
        });

        it('календарь без рабочих дней (сбой настроек) выпуск не останавливает', () => {
            expect(dueAt(monthly, '2026-01-01T07:00:00Z', NO_WORKDAYS)).toBe(
                '2025-12',
            );
        });

        it('первый рабочий день периода', () => {
            const january = ropPeriodOf(ROP_PERIOD_KIND.month, '2026-01-15');
            expect(firstWorkdayOf(january, calendar(HOLIDAYS))).toBe(
                '2026-01-09',
            );
            expect(firstWorkdayOf(january, NO_WORKDAYS)).toBe('2026-01-01');
        });

        it('час вне 0–23 — ошибка', () => {
            expect(() =>
                firstWorkdayDue({ kind: ROP_PERIOD_KIND.month, hour: -1 }),
            ).toThrow(RangeError);
        });
    });
});
