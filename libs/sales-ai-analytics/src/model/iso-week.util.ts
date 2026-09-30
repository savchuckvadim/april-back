/**
 * Ключи ISO-недель и русские даты для текстов витрины: карточка
 * «Внимания» и повестка планёрки называют неделю датой понедельника
 * («с недели 27 июля»), а не ключом «2026-W31».
 *
 * Чистые функции над строками 'YYYY-MM-DD' и 'YYYY-Www': без TZ,
 * без `new Date()` текущего момента.
 */
import { isoWeekday, shiftDate } from './workdays.util';

/** Форма ключа недели: 'YYYY-Www'. */
export const ISO_WEEK_KEY_PATTERN = /^\d{4}-W\d{2}$/;

/** Форма календарной даты: 'YYYY-MM-DD'. */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Месяцы в родительном падеже — «28 июля». */
export const RU_MONTHS_GENITIVE = [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
] as const;

export function isIsoWeekKey(value: string): boolean {
    return ISO_WEEK_KEY_PATTERN.test(value);
}

/** Понедельник ISO-недели по её ключу 'YYYY-Www' (4 января всегда в W01). */
export function mondayOfIsoWeek(weekKey: string): string {
    const [year, week] = weekKey.split('-W');
    const anchor = `${year}-01-04`;
    const firstMonday = shiftDate(anchor, -(isoWeekday(anchor) - 1));

    return shiftDate(firstMonday, (Number(week) - 1) * 7);
}

interface DateParts {
    year: number;
    month: number;
    day: number;
}

function parseDate(date: string): DateParts | null {
    if (!ISO_DATE_PATTERN.test(date)) return null;
    const [year, month, day] = date.split('-').map(Number);

    return month >= 1 && month <= 12 ? { year, month, day } : null;
}

const monthName = (parts: DateParts): string =>
    RU_MONTHS_GENITIVE[parts.month - 1];

/** «28 июля» из 'YYYY-MM-DD'; не дата — как есть. */
export function formatRuDayMonth(date: string): string {
    const parts = parseDate(date);

    return parts === null ? date : `${parts.day} ${monthName(parts)}`;
}

/** «28 июля 2026» из 'YYYY-MM-DD'; не дата — как есть. */
export function formatRuDate(date: string): string {
    const parts = parseDate(date);

    return parts === null
        ? date
        : `${parts.day} ${monthName(parts)} ${parts.year}`;
}

/**
 * Период словами: «1–28 сентября 2026», «25 августа – 28 сентября 2026»,
 * «25 декабря 2025 – 5 января 2026». Одна и та же дата — просто дата.
 */
export function formatRuDateRange(from: string, to: string): string {
    const start = parseDate(from);
    const end = parseDate(to);
    if (start === null || end === null) return `${from} — ${to}`;
    if (from === to) return formatRuDate(from);
    if (start.year === end.year && start.month === end.month) {
        return `${start.day}–${end.day} ${monthName(end)} ${end.year}`;
    }
    if (start.year === end.year) {
        return `${formatRuDayMonth(from)} – ${formatRuDate(to)}`;
    }

    return `${formatRuDate(from)} – ${formatRuDate(to)}`;
}

/**
 * «с сентября» — месяц, первое число которого лежит в ISO-неделе (так
 * месячные ряды записывают начало сигнала); первого числа в неделе нет
 * или не ключ — «с недели …».
 */
export function formatRuMonthSince(weekKey: string): string {
    if (!isIsoWeekKey(weekKey)) return formatRuWeekSince(weekKey);
    const monday = mondayOfIsoWeek(weekKey);
    for (let offset = 0; offset < 7; offset += 1) {
        const parts = parseDate(shiftDate(monday, offset));
        if (parts !== null && parts.day === 1) return `с ${monthName(parts)}`;
    }

    return formatRuWeekSince(weekKey);
}

/** «с недели 27 июля» по ключу недели; не ключ — «с недели <как есть>». */
export function formatRuWeekSince(weekKey: string): string {
    return isIsoWeekKey(weekKey)
        ? `с недели ${formatRuDayMonth(mondayOfIsoWeek(weekKey))}`
        : `с недели ${weekKey}`;
}
