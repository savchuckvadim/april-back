/**
 * Чистая часть производственного календаря портала (план Фазы 2, поток 12):
 * разбор ответа `calendar.settings.get`, запасной календарь РФ и оговорки
 * («на год праздников нет», «в месяце подозрительно много рабочих дней»).
 *
 * Вынесено из `calendar.loader.ts`, чтобы рабочий файл остался в пределах
 * 300 строк, а санити-панель могла переиспользовать проверки без DI,
 * PBXService и кэша (прецедент — `model/stage-theta.types.ts` библиотеки).
 * Здесь нет ни Nest, ни Битрикс: только даты и строки.
 */
import {
    BX_CALENDAR_WEEK_DAY_INDEX,
    isBxCalendarWeekDayCode,
} from '@lib/bitrix/domain/calendar/consts/bx-calendar.const';
import type { IBXCalendarSettings } from '@lib/bitrix/domain/calendar/interface/bx-calendar.interface';
import {
    DEFAULT_WORK_CALENDAR,
    isWorkday,
    shiftDate,
    WorkCalendar,
} from '@lib/sales-ai-analytics';

/** Откуда взят календарь: портал, настройки портала, запасной РФ. */
export const AI_CALENDAR_SOURCES = ['import', 'override', 'fallback'] as const;
export type AiCalendarSource = (typeof AI_CALENDAR_SOURCES)[number];

/** Календарь портала с длиной рабочего дня, источником и оговорками. */
export interface AiCalendarResult {
    calendar: WorkCalendar;
    /** Длина рабочего дня, часов (конец минус начало по настройкам). */
    dayHours: number;
    source: AiCalendarSource;
    /** Оговорки: деградация, «на год нет праздников», странный месяц. */
    warnings: string[];
}

/**
 * Нерабочие праздничные дни РФ (ТК РФ, ст. 112) в формате «день.месяц».
 * Переносы выходных сюда не входят: они меняются постановлением каждый
 * год, поэтому портал задаёт их сам (импорт либо ключ настроек).
 */
export const RU_PRODUCTION_HOLIDAYS = [
    '1.1',
    '2.1',
    '3.1',
    '4.1',
    '5.1',
    '6.1',
    '7.1',
    '8.1',
    '23.2',
    '8.3',
    '1.5',
    '9.5',
    '12.6',
    '4.11',
] as const;

/** Длина рабочего дня запасного календаря: 40 часов / 5 дней (ТК РФ). */
export const AI_CALENDAR_FALLBACK_DAY_HOURS = 8;
/** Больше рабочих дней в месяце при пятидневке не бывает — значит, дыра. */
export const AI_CALENDAR_MAX_WORKDAYS_MONTH = 23;
/** Праздники разворачиваются на соседние годы: границы периодов и backfill. */
export const AI_CALENDAR_YEARS_AROUND = 1;

const MONTHS_IN_YEAR = 12;
const MAX_MONTH_DAYS = 31;
const ISO_WEEK_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const SUNDAY_ISO = 7;
const MAX_DAY_HOURS = 24;

/** Годы, на которые разворачиваются праздники «день.месяц». */
export function yearsAround(year: number): number[] {
    const years: number[] = [];
    for (
        let value = year - AI_CALENDAR_YEARS_AROUND;
        value <= year + AI_CALENDAR_YEARS_AROUND;
        value += 1
    ) {
        years.push(value);
    }
    return years;
}

/** '1.1,7.1' + годы → даты 'YYYY-MM-DD'; мусор молча отбрасывается. */
export function parseBxHolidays(
    yearHolidays: string,
    years: readonly number[],
): string[] {
    const dates: string[] = [];
    for (const item of yearHolidays.split(',')) {
        const [day, month] = item.trim().split('.').map(Number);
        if (
            !Number.isInteger(day) ||
            !Number.isInteger(month) ||
            day < 1 ||
            day > MAX_MONTH_DAYS ||
            month < 1 ||
            month > MONTHS_IN_YEAR
        ) {
            continue;
        }
        for (const year of years) {
            dates.push(
                `${year}-${String(month).padStart(2, '0')}-` +
                    String(day).padStart(2, '0'),
            );
        }
    }
    return [...new Set(dates)].sort((a, b) => a.localeCompare(b));
}

/** ['SA','SU'] → рабочая неделя в ISO-нумерации (1 = понедельник). */
export function parseBxWorkweek(weekHolidays: readonly string[]): number[] {
    const off = new Set(
        weekHolidays
            .filter(isBxCalendarWeekDayCode)
            .map(code => BX_CALENDAR_WEEK_DAY_INDEX[code] || SUNDAY_ISO),
    );
    const workweek = ISO_WEEK_DAYS.filter(day => !off.has(day));
    return workweek.length > 0 ? workweek : [...DEFAULT_WORK_CALENDAR.workweek];
}

/**
 * Часы рабочего дня портала; документация обещает строку, порталы шлют и
 * число. Бессмысленное значение (конец раньше начала, сутки и больше)
 * даёт null — потребитель берёт запасную длину дня и пишет оговорку.
 */
export function parseBxDayHours(settings: IBXCalendarSettings): number | null {
    const from = Number(settings.work_time_start);
    const to = Number(settings.work_time_end);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
    const hours = to - from;
    return hours > 0 && hours <= MAX_DAY_HOURS ? hours : null;
}

/** Запасной производственный календарь РФ на год и его соседей. */
export function ruWorkCalendar(
    year: number,
    timeZone: string = DEFAULT_WORK_CALENDAR.timeZone,
): WorkCalendar {
    return {
        timeZone,
        holidays: parseBxHolidays(
            RU_PRODUCTION_HOLIDAYS.join(','),
            yearsAround(year),
        ),
        workweek: [...DEFAULT_WORK_CALENDAR.workweek],
    };
}

/** Рабочих дней в месяце 'YYYY-MM' по календарю. */
export function workdaysInMonth(
    monthKey: string,
    calendar: WorkCalendar,
): number {
    let cursor = `${monthKey}-01`;
    let workdays = 0;
    for (let scanned = 0; scanned < MAX_MONTH_DAYS; scanned += 1) {
        if (!cursor.startsWith(monthKey)) break;
        if (isWorkday(cursor, calendar)) workdays += 1;
        cursor = shiftDate(cursor, 1);
    }
    return workdays;
}

/**
 * Оговорки календаря на год дня `day`: «на год праздников нет» (портал не
 * завёл производственный календарь) и «в месяце подозрительно много
 * рабочих дней» (при пятидневке больше 23 не бывает — значит, праздники
 * и переносы месяца не заведены).
 */
export function calendarWarnings(
    calendar: WorkCalendar,
    day: string,
): string[] {
    const year = day.slice(0, 4);
    const warnings: string[] = [];
    if (!calendar.holidays.some(date => date.startsWith(year))) {
        warnings.push(
            `Производственный календарь: на ${year} год праздников нет — ` +
                'рабочие дни считаются только по выходным недели',
        );
    }
    for (let month = 1; month <= MONTHS_IN_YEAR; month += 1) {
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const workdays = workdaysInMonth(monthKey, calendar);
        if (workdays > AI_CALENDAR_MAX_WORKDAYS_MONTH) {
            warnings.push(
                `Производственный календарь: в месяце ${monthKey} ` +
                    `${workdays} рабочих дней — больше ` +
                    `${AI_CALENDAR_MAX_WORKDAYS_MONTH}, ` +
                    'праздники месяца не заведены',
            );
        }
    }
    return warnings;
}

/** Настройки портала непусты по этому полю — значит, это переопределение. */
export function hasCalendarOverride(calendar: WorkCalendar): boolean {
    return (
        calendar.holidays.length > 0 ||
        calendar.workweek.join() !== DEFAULT_WORK_CALENDAR.workweek.join()
    );
}
