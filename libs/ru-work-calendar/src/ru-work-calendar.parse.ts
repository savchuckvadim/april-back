import { RU_PRODUCTION_HOLIDAYS } from './ru-production-holidays.const';
import type { RuWorkCalendarYear } from './ru-work-calendar.types';

/**
 * Разбор ответов источников производственного календаря РФ и запасной
 * календарь. Чистые функции: только даты и строки, без сети и Nest.
 *
 * xmlcalendar.ru (`/data/ru/{year}/calendar.json`): по месяцам строка
 * нерабочих дней через запятую; `N` — выходной или праздник, `N+` —
 * перенесённый выходной, `N*` — сокращённый рабочий день. Рабочая суббота
 * в список просто не попадает.
 *
 * isdayoff.ru (`/api/getdata?year=…&cc=ru`): по символу на день года —
 * `0` рабочий, `1` нерабочий, `2` сокращённый, `4` рабочий (перенос).
 */

const pad = (value: number): string => String(value).padStart(2, '0');
const dateOf = (year: number, month: number, day: number): string =>
    `${year}-${pad(month)}-${pad(day)}`;

/** Сб или вс (ISO 6–7) по календарной дате. */
const isWeekend = (date: string): boolean => {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    return day === 0 || day === 6;
};

/** Все даты года по порядку. */
function datesOfYear(year: number): string[] {
    const dates: string[] = [];
    for (let month = 1; month <= 12; month += 1) {
        const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
        for (let day = 1; day <= last; day += 1) {
            dates.push(dateOf(year, month, day));
        }
    }
    return dates;
}

/** Календарь из множества нерабочих и сокращённых дней года. */
function fromDayOffs(
    year: number,
    offs: ReadonlySet<string>,
    shortDays: readonly string[],
): RuWorkCalendarYear {
    const holidays: string[] = [];
    const workingWeekends: string[] = [];
    for (const date of datesOfYear(year)) {
        const off = offs.has(date);
        if (off && !isWeekend(date)) holidays.push(date);
        if (!off && isWeekend(date)) workingWeekends.push(date);
    }
    return {
        year,
        holidays,
        workingWeekends,
        shortDays: [...shortDays].sort(),
        source: 'live',
    };
}

interface XmlCalendarMonth {
    month: number;
    days: string;
}

const isXmlMonth = (value: unknown): value is XmlCalendarMonth => {
    if (typeof value !== 'object' || value === null) return false;
    const item = value as Record<string, unknown>;
    return (
        typeof item.month === 'number' &&
        item.month >= 1 &&
        item.month <= 12 &&
        typeof item.days === 'string'
    );
};

const DAY_TOKEN = /^(\d{1,2})([*+]?)$/;

/** Ответ xmlcalendar.ru → календарь года; чужая форма → null. */
export function parseXmlCalendarJson(
    year: number,
    json: unknown,
): RuWorkCalendarYear | null {
    if (typeof json !== 'object' || json === null) return null;
    const body = json as Record<string, unknown>;
    if (body.year !== year || !Array.isArray(body.months)) return null;
    const months = body.months.filter(isXmlMonth);
    if (months.length !== 12) return null;
    const offs = new Set<string>();
    const shortDays: string[] = [];
    for (const { month, days } of months) {
        for (const raw of days.split(',')) {
            const match = DAY_TOKEN.exec(raw.trim());
            if (!match) return null;
            const date = dateOf(year, month, Number(match[1]));
            if (match[2] === '*') shortDays.push(date);
            else offs.add(date);
        }
    }
    return fromDayOffs(year, offs, shortDays);
}

const DAY_OFF = '1';
const SHORT_DAY = '2';
const DAY_CODES = /^[0124]+$/;

/** Ответ isdayoff.ru → календарь года; длина не та или мусор → null. */
export function parseIsDayOff(
    year: number,
    text: string,
): RuWorkCalendarYear | null {
    const codes = text.trim();
    const dates = datesOfYear(year);
    if (codes.length !== dates.length || !DAY_CODES.test(codes)) return null;
    const offs = new Set<string>();
    const shortDays: string[] = [];
    dates.forEach((date, index) => {
        if (codes[index] === DAY_OFF) offs.add(date);
        if (codes[index] === SHORT_DAY) shortDays.push(date);
    });
    return fromDayOffs(year, offs, shortDays);
}

/** Запасной календарь: праздники ТК РФ на будни, без переносов. */
export function fallbackRuCalendar(year: number): RuWorkCalendarYear {
    const holidays = RU_PRODUCTION_HOLIDAYS.map(item => {
        const [day, month] = item.split('.').map(Number);
        return dateOf(year, month, day);
    }).filter(date => !isWeekend(date));
    return {
        year,
        holidays,
        workingWeekends: [],
        shortDays: [],
        source: 'fallback',
    };
}
