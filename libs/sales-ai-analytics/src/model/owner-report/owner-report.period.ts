import { shiftDate } from '../workdays.util';
import type { OwnerReportPeriodKind } from './owner-report.types';

/**
 * Периоды отчёта собственнику: ключ периода ↔ границы. Ключи: месяц
 * `2026-10`, квартал `2026-Q4`, полугодие `2026-H2`, год `2026`. Все даты
 * — YYYY-MM-DD в TZ портала; время сюда не входит.
 */

export const OWNER_REPORT_PERIOD_KINDS = [
    'month',
    'quarter',
    'half_year',
    'year',
] as const satisfies readonly OwnerReportPeriodKind[];

export interface OwnerReportPeriodBounds {
    kind: OwnerReportPeriodKind;
    periodKey: string;
    from: string;
    to: string;
}

const MONTHS_PER_KIND: Readonly<Record<OwnerReportPeriodKind, number>> = {
    month: 1,
    quarter: 3,
    half_year: 6,
    year: 12,
};

const PERIOD_KEY_PATTERNS: Readonly<Record<OwnerReportPeriodKind, RegExp>> = {
    month: /^(\d{4})-(0[1-9]|1[0-2])$/,
    quarter: /^(\d{4})-Q([1-4])$/,
    half_year: /^(\d{4})-H([12])$/,
    year: /^(\d{4})$/,
};

const pad = (value: number): string => String(value).padStart(2, '0');

/** Последний день месяца (month 1–12). */
function lastDayOfMonth(year: number, month: number): string {
    const next =
        month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`;
    return shiftDate(next, -1);
}

/** Ключ периода вида kind для даты. */
export function ownerReportPeriodKey(
    kind: OwnerReportPeriodKind,
    date: string,
): string {
    const year = Number(date.slice(0, 4));
    const month = Number(date.slice(5, 7));
    switch (kind) {
        case 'month':
            return `${year}-${pad(month)}`;
        case 'quarter':
            return `${year}-Q${Math.ceil(month / 3)}`;
        case 'half_year':
            return `${year}-H${month <= 6 ? 1 : 2}`;
        default:
            return String(year);
    }
}

/** Границы периода по ключу; чужой ключ — null. */
export function ownerReportPeriodBounds(
    kind: OwnerReportPeriodKind,
    periodKey: string,
): OwnerReportPeriodBounds | null {
    const match = PERIOD_KEY_PATTERNS[kind].exec(periodKey);
    if (!match) return null;
    const year = Number(match[1]);
    const index = match[2] === undefined ? 1 : Number(match[2]);
    const months = MONTHS_PER_KIND[kind];
    const firstMonth = kind === 'month' ? index : (index - 1) * months + 1;
    const lastMonth = firstMonth + months - 1;
    return {
        kind,
        periodKey,
        from: `${year}-${pad(firstMonth)}-01`,
        to: lastDayOfMonth(year, lastMonth),
    };
}

/** Предыдущий период той же длины. */
export function previousOwnerReportPeriod(
    bounds: OwnerReportPeriodBounds,
): OwnerReportPeriodBounds {
    const previousDay = shiftDate(bounds.from, -1);
    const key = ownerReportPeriodKey(bounds.kind, previousDay);
    const previous = ownerReportPeriodBounds(bounds.kind, key);
    if (!previous)
        throw new Error(`Не удалось вычислить прошлый период для ${key}`);
    return previous;
}

/** Последний закрытый период вида kind на день today (не включающий today). */
export function latestClosedOwnerReportPeriod(
    kind: OwnerReportPeriodKind,
    today: string,
): OwnerReportPeriodBounds {
    const current = ownerReportPeriodBounds(
        kind,
        ownerReportPeriodKey(kind, today),
    );
    if (!current) throw new Error(`Не удалось вычислить период для ${today}`);
    return previousOwnerReportPeriod(current);
}

export function isOwnerReportPeriodKind(
    value: unknown,
): value is OwnerReportPeriodKind {
    return (
        typeof value === 'string' &&
        (OWNER_REPORT_PERIOD_KINDS as readonly string[]).includes(value)
    );
}

/**
 * Виды периодов из строки настройки «month, quarter»; чужие коды
 * отбрасываются, порядок — справочника. Пусто или ключа нет (старый
 * портал, мок) — ни одного вида.
 */
export function parseOwnerReportKinds(
    value: string | null | undefined,
): OwnerReportPeriodKind[] {
    const wanted = new Set(
        (value ?? '')
            .split(',')
            .map(item => item.trim().toLowerCase())
            .filter(isOwnerReportPeriodKind),
    );
    return OWNER_REPORT_PERIOD_KINDS.filter(kind => wanted.has(kind));
}

/** Ключи месяцев (YYYY-MM) внутри границ периода, по порядку. */
export function ownerReportMonthKeys(
    bounds: Pick<OwnerReportPeriodBounds, 'from' | 'to'>,
): string[] {
    const keys: string[] = [];
    let year = Number(bounds.from.slice(0, 4));
    let month = Number(bounds.from.slice(5, 7));
    const last = bounds.to.slice(0, 7);
    for (;;) {
        const key = `${year}-${pad(month)}`;
        if (key > last) break;
        keys.push(key);
        month += 1;
        if (month > 12) {
            month = 1;
            year += 1;
        }
    }
    return keys;
}
