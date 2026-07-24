/**
 * Разбиение периода отчёта на календарно-месячные сегменты.
 *
 * Сегмент кэшируется долгоживуще только если он покрывает целый календарный
 * месяц И этот месяц закончился до начала текущего (данные закрыты).
 * Текущий месяц и неполные краевые сегменты всегда считаются заново.
 */

export interface MonthSegment {
    /** Начало сегмента, yyyy-MM-dd (включительно). */
    from: string;
    /** Конец сегмента, yyyy-MM-dd (включительно). */
    to: string;
    /** Календарный месяц сегмента, yyyy-MM. */
    month: string;
    /** Можно ли кэшировать сегмент долгоживуще. */
    cacheable: boolean;
}

function toIsoDate(year: number, monthIndex: number, day: number): string {
    const mm = String(monthIndex + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
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
            month: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
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
