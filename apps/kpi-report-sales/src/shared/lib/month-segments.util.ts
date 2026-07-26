/**
 * Разбиение периода отчёта на календарно-месячные сегменты.
 *
 * Сегмент кэшируется долгоживуще только если он покрывает целый календарный
 * месяц И этот месяц закончился до начала текущего (данные закрыты).
 * Текущий месяц и неполные краевые сегменты всегда считаются заново.
 */

/** Дата в формате yyyy-MM-dd. */
export type IsoDate = `${number}-${number}-${number}`;

/** Календарный месяц в формате yyyy-MM. */
export type IsoMonth = `${number}-${number}`;

export interface MonthSegment {
    /** Начало сегмента, yyyy-MM-dd (включительно). */
    from: IsoDate;
    /** Конец сегмента, yyyy-MM-dd (включительно). */
    to: IsoDate;
    /** Календарный месяц сегмента, yyyy-MM. */
    month: IsoMonth;
    /** Можно ли кэшировать сегмент долгоживуще. */
    cacheable: boolean;
}

function toIsoDate(year: number, monthIndex: number, day: number): IsoDate {
    const mm = String(monthIndex + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}` as IsoDate;
}

function daysInMonth(year: number, monthIndex: number): number {
    return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function parseIsoDate(value: string): {
    year: number;
    monthIndex: number;
    day: number;
} {
    const [year, month, day] = value.split('-').map(Number);
    return { year, monthIndex: month - 1, day };
}

/** Первый день следующего месяца — эксклюзивная граница `<` для выборок. */
export function firstDayOfNextMonth(month: IsoMonth): IsoDate {
    const [year, mm] = month.split('-').map(Number);
    const nextYear = mm === 12 ? year + 1 : year;
    const nextMonth = mm === 12 ? 1 : mm + 1;
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01` as IsoDate;
}

/** Date → yyyy-MM-dd (локальные компоненты — как воспринимает фильтр отчёта). */
export function toIsoDateOf(d: Date): IsoDate {
    return toIsoDate(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Календарный месяц Date → yyyy-MM. */
export function monthOf(d: Date): IsoMonth {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` as IsoMonth;
}

/** Следующий календарный день (эксклюзивная граница `<` для выборок дня). */
export function nextDay(date: IsoDate): IsoDate {
    const { year, monthIndex, day } = parseIsoDate(date);
    const d = new Date(Date.UTC(year, monthIndex, day + 1));
    return toIsoDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Предыдущий календарный день. */
export function prevDay(date: IsoDate): IsoDate {
    const { year, monthIndex, day } = parseIsoDate(date);
    const d = new Date(Date.UTC(year, monthIndex, day - 1));
    return toIsoDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Список дат [from..to] включительно (yyyy-MM-dd); from>to → пусто. */
export function enumerateDates(from: IsoDate, to: IsoDate): IsoDate[] {
    if (from > to) return [];
    const dates: IsoDate[] = [];
    let cursor = from;
    while (cursor <= to) {
        dates.push(cursor);
        cursor = nextDay(cursor);
    }
    return dates;
}

/**
 * Разбивает [dateFrom..dateTo] (yyyy-MM-dd, включительно) на сегменты
 * по календарным месяцам. from > to → пустой массив.
 */
export function splitIntoMonthSegments(
    dateFrom: string,
    dateTo: string,
    now: Date,
): MonthSegment[] {
    if (dateFrom > dateTo) return [];

    const start = parseIsoDate(dateFrom);
    const end = parseIsoDate(dateTo);
    const nowYear = now.getFullYear();
    const nowMonthIndex = now.getMonth();

    const segments: MonthSegment[] = [];
    let year = start.year;
    let monthIndex = start.monthIndex;

    while (
        year < end.year ||
        (year === end.year && monthIndex <= end.monthIndex)
    ) {
        const isFirst = year === start.year && monthIndex === start.monthIndex;
        const isLast = year === end.year && monthIndex === end.monthIndex;
        const lastDay = daysInMonth(year, monthIndex);

        const fromDay = isFirst ? start.day : 1;
        const toDay = isLast ? end.day : lastDay;

        const coversFullMonth = fromDay === 1 && toDay === lastDay;
        const isPastMonth =
            year < nowYear || (year === nowYear && monthIndex < nowMonthIndex);

        segments.push({
            from: toIsoDate(year, monthIndex, fromDay),
            to: toIsoDate(year, monthIndex, toDay),
            month: `${year}-${String(monthIndex + 1).padStart(2, '0')}` as IsoMonth,
            cacheable: coversFullMonth && isPastMonth,
        });

        monthIndex += 1;
        if (monthIndex > 11) {
            monthIndex = 0;
            year += 1;
        }
    }

    return segments;
}
