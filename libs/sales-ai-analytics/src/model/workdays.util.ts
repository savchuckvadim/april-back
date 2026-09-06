/**
 * Рабочий календарь портала: TZ (IANA), праздники YYYY-MM-DD и рабочие дни
 * недели в ISO-нумерации (1 = понедельник … 7 = воскресенье).
 * Формат JSON ключа настроек ai_analytics_calendar:
 * {"timeZone":"Europe/Moscow","holidays":["2026-11-04"],"workweek":[1,2,3,4,5]}
 */
export interface WorkCalendar {
    timeZone: string;
    holidays: string[];
    workweek: number[];
}

export const DEFAULT_WORK_CALENDAR: WorkCalendar = {
    timeZone: 'Europe/Moscow',
    holidays: [],
    workweek: [1, 2, 3, 4, 5],
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
/** Предохранитель от бесконечного обхода при «пустом» календаре. */
const MAX_SCAN_DAYS = 3660;
const MS_PER_DAY = 86_400_000;

/** Глубокая копия календаря по умолчанию (массивы не разделяются). */
const defaultCalendar = (): WorkCalendar => ({
    timeZone: DEFAULT_WORK_CALENDAR.timeZone,
    holidays: [...DEFAULT_WORK_CALENDAR.holidays],
    workweek: [...DEFAULT_WORK_CALENDAR.workweek],
});

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
    const cached = formatters.get(timeZone);
    if (cached) {
        return cached;
    }
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    formatters.set(timeZone, formatter);
    return formatter;
}

function isValidTimeZone(timeZone: string): boolean {
    try {
        formatterFor(timeZone);
        return true;
    } catch {
        return false;
    }
}

/** Календарная дата YYYY-MM-DD момента date в часовом поясе timeZone. */
export function toPortalDate(date: Date, timeZone: string): string {
    const parts = formatterFor(timeZone).formatToParts(date);
    const pick = (type: Intl.DateTimeFormatPartTypes): string =>
        parts.find(part => part.type === type)?.value ?? '';
    return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

function parseIsoDate(date: string): number {
    const [year, month, day] = date.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
}

function formatUtcDate(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
}

/** Сдвиг календарной даты YYYY-MM-DD на days дней (без учёта TZ). */
export function shiftDate(date: string, days: number): string {
    return formatUtcDate(parseIsoDate(date) + days * MS_PER_DAY);
}

/** ISO-день недели календарной даты: 1 = понедельник … 7 = воскресенье. */
export function isoWeekday(date: string): number {
    const day = new Date(parseIsoDate(date)).getUTCDay();
    return day === 0 ? 7 : day;
}

function normalizeWorkweek(value: unknown): number[] {
    if (!Array.isArray(value)) {
        return [...DEFAULT_WORK_CALENDAR.workweek];
    }
    const days = ISO_WEEKDAYS.filter(day => value.includes(day));
    return days.length > 0 ? days : [...DEFAULT_WORK_CALENDAR.workweek];
}

function normalizeHolidays(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter(
        (item): item is string =>
            typeof item === 'string' && ISO_DATE_RE.test(item),
    );
}

/**
 * Разбор JSON календаря из настроек портала. Пустая строка, битый JSON,
 * не-объект → DEFAULT_WORK_CALENDAR; невалидная TZ → TZ по умолчанию;
 * пустой/битый workweek → пн–пт; праздники не в формате YYYY-MM-DD отбрасываются.
 */
export function parseWorkCalendar(
    json: string | null | undefined,
): WorkCalendar {
    if (!json || json.trim() === '') {
        return defaultCalendar();
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        return defaultCalendar();
    }
    if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
    ) {
        return defaultCalendar();
    }
    const raw = parsed as Record<string, unknown>;
    const timeZone =
        typeof raw.timeZone === 'string' && isValidTimeZone(raw.timeZone)
            ? raw.timeZone
            : DEFAULT_WORK_CALENDAR.timeZone;
    return {
        timeZone,
        holidays: normalizeHolidays(raw.holidays),
        workweek: normalizeWorkweek(raw.workweek),
    };
}

/** Рабочий ли день: день недели входит в workweek и дата не праздник. */
export function isWorkday(date: string, calendar: WorkCalendar): boolean {
    return (
        calendar.workweek.includes(isoWeekday(date)) &&
        !calendar.holidays.includes(date)
    );
}

/**
 * Последние count рабочих дней по возрастанию; endDate включается, если
 * рабочий. Праздники и выходные пропускаются.
 */
export function lastWorkdays(
    endDate: string,
    count: number,
    calendar: WorkCalendar,
): string[] {
    const result: string[] = [];
    let cursor = endDate;
    for (let scanned = 0; scanned < MAX_SCAN_DAYS && result.length < count; ) {
        if (isWorkday(cursor, calendar)) {
            result.push(cursor);
        }
        cursor = shiftDate(cursor, -1);
        scanned += 1;
    }
    return result.reverse();
}

/** Ближайший рабочий день строго раньше date. */
export function previousWorkday(date: string, calendar: WorkCalendar): string {
    let cursor = shiftDate(date, -1);
    for (let scanned = 0; scanned < MAX_SCAN_DAYS; scanned += 1) {
        if (isWorkday(cursor, calendar)) {
            return cursor;
        }
        cursor = shiftDate(cursor, -1);
    }
    return cursor;
}
