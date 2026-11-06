import { isWorkday, shiftDate, type WorkCalendar } from '../workdays.util';
import { OWNER_REPORT_PERIOD_KINDS } from './owner-report.period';
import type { OwnerReportPeriodKind } from './owner-report.types';

/**
 * Расписание отчёта собственнику: выпуск — n-й рабочий день месяца (по
 * умолчанию второй: ночной конвейер успел закрыть прошлый месяц), виды
 * периодов, у которых в этом месяце закрылся период.
 */

/** Какой по счёту рабочий день месяца — день выпуска. */
export const OWNER_REPORT_RELEASE_WORKDAY = 2;

/** Порядковый номер рабочего дня в месяце (1 — первый); нерабочий день — null. */
export function workdayOrdinalInMonth(
    date: string,
    calendar: WorkCalendar,
): number | null {
    if (!isWorkday(date, calendar)) return null;
    let ordinal = 0;
    for (
        let day = `${date.slice(0, 7)}-01`;
        day <= date;
        day = shiftDate(day, 1)
    ) {
        if (isWorkday(day, calendar)) ordinal += 1;
    }
    return ordinal;
}

/** Месяцы (1–12), в начале которых закрывается период вида kind. */
const CLOSING_MONTHS: Readonly<
    Record<OwnerReportPeriodKind, readonly number[]>
> = {
    month: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    quarter: [1, 4, 7, 10],
    half_year: [1, 7],
    year: [1],
};

/**
 * Виды периодов, которые пора выпускать в день `date`: из включённых на
 * портале — те, чей период закрылся с началом месяца этой даты. Порядок —
 * справочника (месяц, квартал, полугодие, год).
 */
export function ownerReportDueKinds(
    enabled: readonly OwnerReportPeriodKind[],
    date: string,
): OwnerReportPeriodKind[] {
    const month = Number(date.slice(5, 7));
    return OWNER_REPORT_PERIOD_KINDS.filter(
        kind => enabled.includes(kind) && CLOSING_MONTHS[kind].includes(month),
    );
}
