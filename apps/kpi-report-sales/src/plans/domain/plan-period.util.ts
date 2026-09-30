/**
 * Пересчёт плана руководителя под произвольный период — бэкенд-двойник
 * фронтового `feature/plans/lib/plan-period.util.ts` (блок «Планы»):
 * числа AI-вкладки обязаны совпадать с виджетом до копейки.
 *
 * Руководитель задаёт значение на период-тип (месяц/квартал/год); значение
 * нормализуется к МЕСЯЧНОЙ ставке (/1, /3, /12), затем план на период =
 * Σ по календарным месяцам пересечения (частичный месяц — пропорционально
 * дням). Порядок операций и округление — как у фронта: сумма
 * `ставка × (дни / днейМесяца)` по месяцам, затем округление до сотых.
 *
 * Даты — календарные дни `YYYY-MM-DD` (часовой пояс не участвует: фронт
 * работает с теми же строками фильтра в локальном времени портала).
 * Чистые функции.
 */
import type { PlanPeriodType } from '../constants/plan-indicators.const';

/**
 * Месяцев в периоде, на который задаётся значение плана. Ключи прижаты к
 * PLAN_PERIOD_TYPES через satisfies: новый период-тип не соберётся без
 * своей ставки.
 */
export const PLAN_MONTHS_IN_PERIOD = {
    month: 1,
    quarter: 3,
    year: 12,
} as const satisfies Record<PlanPeriodType, number>;

/** Календарный день периода (месяц 1–12). */
interface CalendarDay {
    year: number;
    month: number;
    day: number;
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

function daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** `YYYY-MM-DD…` → календарный день; невалидная дата → null. */
function parseCalendarDay(value: string): CalendarDay | null {
    const match = ISO_DAY.exec(value);
    if (!match) return null;
    const [year, month, day] = match.slice(1).map(Number);
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > daysInMonth(year, month)) return null;
    return { year, month, day };
}

/** Порядковый номер месяца для сравнения и перебора. */
const monthIndex = (date: CalendarDay): number => date.year * 12 + date.month;

function isAfter(a: CalendarDay, b: CalendarDay): boolean {
    if (a.year !== b.year) return a.year > b.year;
    if (a.month !== b.month) return a.month > b.month;
    return a.day > b.day;
}

/** Значение плана → месячная ставка. */
export function planMonthlyRate(
    value: number,
    periodType: PlanPeriodType,
): number {
    return value / PLAN_MONTHS_IN_PERIOD[periodType];
}

/**
 * План на диапазон [fromIso..toIso] (обе даты включительно): Σ по месяцам
 * пересечения (полный месяц = месячная ставка, частичный — ставка ×
 * дни / днейМесяца), округление до сотых. Невалидные даты или from > to → 0.
 */
export function planForRange(
    value: number,
    periodType: PlanPeriodType,
    fromIso: string,
    toIso: string,
): number {
    const from = parseCalendarDay(fromIso);
    const to = parseCalendarDay(toIso);
    if (!from || !to || isAfter(from, to)) return 0;

    const monthly = planMonthlyRate(value, periodType);
    const first = monthIndex(from);
    const last = monthIndex(to);
    let total = 0;
    for (let index = first; index <= last; index += 1) {
        const year = Math.floor((index - 1) / 12);
        const month = index - year * 12;
        const days = daysInMonth(year, month);
        const startDay = index === first ? from.day : 1;
        const endDay = index === last ? to.day : days;
        total += monthly * ((endDay - startDay + 1) / days);
    }
    return Math.round(total * 100) / 100;
}
