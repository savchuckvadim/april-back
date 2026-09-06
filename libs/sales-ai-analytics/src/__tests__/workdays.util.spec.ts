import {
    DEFAULT_WORK_CALENDAR,
    WorkCalendar,
    isWorkday,
    isoWeekday,
    lastWorkdays,
    parseWorkCalendar,
    previousWorkday,
    shiftDate,
    toPortalDate,
} from '../model/workdays.util';

// Сентябрь 2026: 04 — пятница, 05 — суббота, 06 — воскресенье, 07 — понедельник,
// 10 — четверг, 11 — пятница.
const FRI = '2026-09-11';
const THU = '2026-09-10';
const MON = '2026-09-07';
const SAT = '2026-09-05';
const PREV_FRI = '2026-09-04';

const withHolidays = (holidays: string[]): WorkCalendar => ({
    ...DEFAULT_WORK_CALENDAR,
    holidays,
});

describe('toPortalDate', () => {
    it('Europe/Moscow на границе суток UTC: 22:30Z → следующий день', () => {
        expect(
            toPortalDate(new Date('2026-09-05T22:30:00Z'), 'Europe/Moscow'),
        ).toBe('2026-09-06');
        expect(
            toPortalDate(new Date('2026-09-05T20:59:59Z'), 'Europe/Moscow'),
        ).toBe('2026-09-05');
        expect(
            toPortalDate(new Date('2026-09-05T21:00:00Z'), 'Europe/Moscow'),
        ).toBe('2026-09-06');
    });

    it('UTC и западный пояс', () => {
        expect(toPortalDate(new Date('2026-09-05T22:30:00Z'), 'UTC')).toBe(
            '2026-09-05',
        );
        expect(
            toPortalDate(new Date('2026-09-06T02:00:00Z'), 'America/New_York'),
        ).toBe('2026-09-05');
    });

    it('невалидная TZ бросает RangeError', () => {
        expect(() => toPortalDate(new Date(), 'Nope/Zone')).toThrow(RangeError);
    });
});

describe('isoWeekday / shiftDate', () => {
    it('ISO: пятница = 5, воскресенье = 7, понедельник = 1', () => {
        expect(isoWeekday(FRI)).toBe(5);
        expect(isoWeekday('2026-09-06')).toBe(7);
        expect(isoWeekday(MON)).toBe(1);
    });

    it('сдвиг через границу месяца и года', () => {
        expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31');
        expect(shiftDate('2026-08-31', 1)).toBe('2026-09-01');
        expect(shiftDate('2026-02-28', 1)).toBe('2026-03-01');
    });
});

describe('isWorkday', () => {
    it('будни — да, выходные и праздники — нет', () => {
        expect(isWorkday(FRI, DEFAULT_WORK_CALENDAR)).toBe(true);
        expect(isWorkday(SAT, DEFAULT_WORK_CALENDAR)).toBe(false);
        expect(isWorkday(THU, withHolidays([THU]))).toBe(false);
    });

    it('шестидневка делает субботу рабочей', () => {
        const sixDays: WorkCalendar = {
            ...DEFAULT_WORK_CALENDAR,
            workweek: [1, 2, 3, 4, 5, 6],
        };
        expect(isWorkday(SAT, sixDays)).toBe(true);
        expect(isWorkday('2026-09-06', sixDays)).toBe(false);
    });
});

describe('lastWorkdays', () => {
    it('через праздник (четверг) и выходные: 5 дней до пятницы', () => {
        expect(lastWorkdays(FRI, 5, withHolidays([THU]))).toEqual([
            PREV_FRI,
            MON,
            '2026-09-08',
            '2026-09-09',
            FRI,
        ]);
    });

    it('окно через понедельник: пятница + понедельник', () => {
        expect(lastWorkdays(MON, 2, DEFAULT_WORK_CALENDAR)).toEqual([
            PREV_FRI,
            MON,
        ]);
    });

    it('endDate-выходной не включается', () => {
        expect(lastWorkdays(SAT, 1, DEFAULT_WORK_CALENDAR)).toEqual([PREV_FRI]);
    });

    it('count = 0 → пусто', () => {
        expect(lastWorkdays(FRI, 0, DEFAULT_WORK_CALENDAR)).toEqual([]);
    });

    it('25 рабочих дней — по возрастанию, все рабочие', () => {
        const days = lastWorkdays(FRI, 25, DEFAULT_WORK_CALENDAR);
        expect(days).toHaveLength(25);
        expect([...days].sort()).toEqual(days);
        expect(days.every(day => isWorkday(day, DEFAULT_WORK_CALENDAR))).toBe(
            true,
        );
        expect(days[days.length - 1]).toBe(FRI);
    });
});

describe('previousWorkday', () => {
    it('понедельник → прошлая пятница; праздник пропускается', () => {
        expect(previousWorkday(MON, DEFAULT_WORK_CALENDAR)).toBe(PREV_FRI);
        expect(previousWorkday(FRI, withHolidays([THU]))).toBe('2026-09-09');
        expect(previousWorkday(SAT, DEFAULT_WORK_CALENDAR)).toBe(PREV_FRI);
    });
});

describe('parseWorkCalendar', () => {
    it('пусто / null / битый JSON → календарь по умолчанию', () => {
        expect(parseWorkCalendar('')).toEqual(DEFAULT_WORK_CALENDAR);
        expect(parseWorkCalendar(null)).toEqual(DEFAULT_WORK_CALENDAR);
        expect(parseWorkCalendar(undefined)).toEqual(DEFAULT_WORK_CALENDAR);
        expect(parseWorkCalendar('{oops')).toEqual(DEFAULT_WORK_CALENDAR);
        expect(parseWorkCalendar('[1,2]')).toEqual(DEFAULT_WORK_CALENDAR);
        expect(parseWorkCalendar('"str"')).toEqual(DEFAULT_WORK_CALENDAR);
    });

    it('валидный JSON разбирается полностью', () => {
        expect(
            parseWorkCalendar(
                '{"timeZone":"Asia/Yekaterinburg","holidays":["2026-11-04"],"workweek":[1,2,3,4,5,6]}',
            ),
        ).toEqual({
            timeZone: 'Asia/Yekaterinburg',
            holidays: ['2026-11-04'],
            workweek: [1, 2, 3, 4, 5, 6],
        });
    });

    it('невалидная TZ → TZ по умолчанию, остальное сохраняется', () => {
        const calendar = parseWorkCalendar(
            '{"timeZone":"Nope/Zone","holidays":["2026-11-04"]}',
        );
        expect(calendar.timeZone).toBe('Europe/Moscow');
        expect(calendar.holidays).toEqual(['2026-11-04']);
        expect(calendar.workweek).toEqual([1, 2, 3, 4, 5]);
    });

    it('мусор в workweek/holidays отфильтровывается, пустой workweek → пн–пт', () => {
        expect(
            parseWorkCalendar(
                '{"workweek":[0,8,"x",2,2,7],"holidays":["x",5,"2026-01-01"]}',
            ),
        ).toEqual({
            timeZone: 'Europe/Moscow',
            holidays: ['2026-01-01'],
            workweek: [2, 7],
        });
        expect(parseWorkCalendar('{"workweek":[]}').workweek).toEqual([
            1, 2, 3, 4, 5,
        ]);
        expect(parseWorkCalendar('{"workweek":"mon"}').workweek).toEqual([
            1, 2, 3, 4, 5,
        ]);
    });

    it('возвращает копию дефолта, а не сам объект', () => {
        const calendar = parseWorkCalendar('');
        calendar.holidays.push('2026-01-01');
        expect(DEFAULT_WORK_CALENDAR.holidays).toEqual([]);
    });
});
