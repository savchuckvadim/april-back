import {
    EXPOSURE_DEFAULTS,
    ExposureActivityDay,
    computeExposure,
    enumerateWorkdays,
    splitZeroRuns,
} from '../model/exposure';
import { WorkCalendar } from '../model/workdays.util';

/** Ноябрь 2026: 4 ноября — праздник, рабочая неделя пн–пт. */
const CALENDAR: WorkCalendar = {
    timeZone: 'Europe/Moscow',
    holidays: ['2026-11-04'],
    workweek: [1, 2, 3, 4, 5],
};

const MONTH_START = '2026-11-01';
const MONTH_END = '2026-11-30';

/** Все рабочие дни месяца с одним событием, кроме перечисленных дат. */
function activityExcept(zeroDays: readonly string[]): ExposureActivityDay[] {
    return enumerateWorkdays(MONTH_START, MONTH_END, CALENDAR)
        .filter(day => !zeroDays.includes(day))
        .map(day => ({ date: day, events: 3 }));
}

describe('enumerateWorkdays', () => {
    it('пропускает выходные и праздник портала', () => {
        const days = enumerateWorkdays(MONTH_START, MONTH_END, CALENDAR);
        expect(days).not.toContain('2026-11-04');
        expect(days).not.toContain('2026-11-01');
        expect(days).toContain('2026-11-03');
        expect(days).toContain('2026-11-05');
        expect(days).toHaveLength(20);
    });

    it('пустое окно, если конец раньше начала', () => {
        expect(enumerateWorkdays('2026-11-10', '2026-11-09', CALENDAR)).toEqual(
            [],
        );
    });
});

describe('splitZeroRuns', () => {
    it('серия из 2 нулевых дней — простой, из 3 — прокси-отсутствие', () => {
        const days = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'];
        const withEvents = new Set(['d1', 'd4', 'd8']);
        const runs = splitZeroRuns(days, day => withEvents.has(day), 3);
        expect(runs.proxy).toEqual(['d5', 'd6', 'd7']);
        expect(runs.idle).toBe(2);
    });
});

describe('computeExposure', () => {
    it('чистый месяц: D_calendar = D_mt = D_active, нормы не исключаются', () => {
        const result = computeExposure({
            monthStart: MONTH_START,
            monthEnd: MONTH_END,
            calendar: CALENDAR,
            activity: activityExcept([]),
        });
        expect(result.dCalendar).toBe(20);
        expect(result.dMt).toBe(20);
        expect(result.dActive).toBe(20);
        expect(result.idleDays).toBe(0);
        expect(result.daysSource).toBe('calendar');
        expect(result.excludeFromNorms).toBe(false);
        expect(result.excludeReason).toBeNull();
    });

    it('серия из 2 нулевых дней НЕ даёт прокси-отсутствия', () => {
        const result = computeExposure({
            monthStart: MONTH_START,
            monthEnd: MONTH_END,
            calendar: CALENDAR,
            activity: activityExcept(['2026-11-10', '2026-11-11']),
        });
        expect(result.proxyAbsenceDays).toEqual([]);
        expect(result.idleDays).toBe(2);
        expect(result.dMt).toBe(20);
        expect(result.daysSource).toBe('calendar');
        expect(result.excludeFromNorms).toBe(false);
    });

    it('серия из 3 нулевых дней даёт прокси-отсутствие и исключение', () => {
        const result = computeExposure({
            monthStart: MONTH_START,
            monthEnd: MONTH_END,
            calendar: CALENDAR,
            activity: activityExcept([
                '2026-11-10',
                '2026-11-11',
                '2026-11-12',
            ]),
        });
        expect(result.proxyAbsenceDays).toEqual([
            '2026-11-10',
            '2026-11-11',
            '2026-11-12',
        ]);
        expect(result.idleDays).toBe(0);
        expect(result.dMt).toBe(17);
        expect(result.daysSource).toBe('proxy');
        expect(result.excludeFromNorms).toBe(true);
        expect(result.excludeReason).toBe('proxy');
    });

    it('окно экспозиции через праздник: 3 нулевых рабочих дня подряд', () => {
        // 2, 3 и 5 ноября — рабочие подряд, 4 ноября праздник серию не рвёт.
        const result = computeExposure({
            monthStart: MONTH_START,
            monthEnd: MONTH_END,
            calendar: CALENDAR,
            activity: activityExcept([
                '2026-11-02',
                '2026-11-03',
                '2026-11-05',
            ]),
        });
        expect(result.proxyAbsenceDays).toEqual([
            '2026-11-02',
            '2026-11-03',
            '2026-11-05',
        ]);
        expect(result.dMt).toBe(17);
    });

    it('без праздника те же дни дают ту же серию, но D_calendar больше', () => {
        const noHolidays: WorkCalendar = { ...CALENDAR, holidays: [] };
        const result = computeExposure({
            monthStart: MONTH_START,
            monthEnd: MONTH_END,
            calendar: noHolidays,
            activity: enumerateWorkdays(MONTH_START, MONTH_END, noHolidays)
                .filter(
                    day =>
                        !['2026-11-02', '2026-11-03', '2026-11-05'].includes(
                            day,
                        ),
                )
                .map(day => ({ date: day, events: 1 })),
        });
        expect(result.dCalendar).toBe(21);
        // 4 ноября рабочий и с событием — серия рвётся на две по 2 и 1 день.
        expect(result.proxyAbsenceDays).toEqual([]);
        expect(result.idleDays).toBe(3);
    });

    it('fte и заявленные отсутствия РОПа уменьшают D_mt', () => {
        const result = computeExposure({
            monthStart: MONTH_START,
            monthEnd: MONTH_END,
            calendar: CALENDAR,
            activity: activityExcept(['2026-11-10', '2026-11-11']),
            absences: ['2026-11-10', '2026-11-11', '2026-11-12'],
            fte: 0.5,
        });
        expect(result.dMt).toBe(8.5);
        expect(result.daysSource).toBe('absences');
        expect(result.proxyAbsenceDays).toEqual([]);
        expect(result.excludeFromNorms).toBe(false);
    });

    it('D_mt < min_workdays_month = 8 → исключение из норм', () => {
        const result = computeExposure({
            monthStart: MONTH_START,
            monthEnd: MONTH_END,
            calendar: CALENDAR,
            activity: activityExcept([]),
            fte: 0.3,
        });
        expect(result.dMt).toBe(6);
        expect(result.excludeFromNorms).toBe(true);
        expect(result.excludeReason).toBe('min_workdays');
        expect(EXPOSURE_DEFAULTS.minWorkdaysMonth).toBe(8);
    });

    it('D_active считает дни с событиями, в том числе выходные', () => {
        const result = computeExposure({
            monthStart: MONTH_START,
            monthEnd: MONTH_END,
            calendar: CALENDAR,
            activity: [
                { date: '2026-11-03', events: 2 },
                { date: '2026-11-07', events: 1 },
                { date: '2026-11-09', events: 0 },
                { date: '2026-12-01', events: 5 },
            ],
        });
        expect(result.dActive).toBe(2);
        expect(EXPOSURE_DEFAULTS.absenceProxyMinRun).toBe(3);
    });

    it('месяц без единого события: прокси-отсутствие на все рабочие дни', () => {
        const result = computeExposure({
            monthStart: MONTH_START,
            monthEnd: MONTH_END,
            calendar: CALENDAR,
            activity: [],
        });
        expect(result.dMt).toBe(0);
        expect(result.dActive).toBe(0);
        expect(result.proxyAbsenceDays).toHaveLength(20);
        expect(result.daysSource).toBe('proxy');
        expect(result.excludeReason).toBe('proxy');
    });
});
