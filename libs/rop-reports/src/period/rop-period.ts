import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { ETimeZone } from '@lib/shared/lib/date';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * ПЕРИОДЫ ОТЧЁТОВ РОПу — чистые функции над календарными днями
 * 'YYYY-MM-DD' в таймзоне портала: ключ периода, его границы, подпись,
 * прошлый период и тот же период год назад.
 *
 * Неделя — календарная ISO-неделя (пн–вс, год недели — год её четверга),
 * а не «семь дней до прогона»: так недели сопоставимы с месяцем и с
 * витриной. Арифметика дат — в полуночах UTC, без сдвигов таймзоны;
 * таймзона нужна только на краях — «какой сегодня день у портала» и
 * «момент начала периода».
 */

export const ROP_PERIOD_KIND = {
    week: 'week',
    month: 'month',
    quarter: 'quarter',
    halfYear: 'half_year',
    year: 'year',
} as const;

export type RopPeriodKind =
    (typeof ROP_PERIOD_KIND)[keyof typeof ROP_PERIOD_KIND];

/** Все виды периодов от короткого к длинному. */
export const ROP_PERIOD_KINDS = [
    ROP_PERIOD_KIND.week,
    ROP_PERIOD_KIND.month,
    ROP_PERIOD_KIND.quarter,
    ROP_PERIOD_KIND.halfYear,
    ROP_PERIOD_KIND.year,
] as const satisfies readonly RopPeriodKind[];

/** Период отчёта: границы — дни портала, последний включительно. */
export interface RopPeriod {
    readonly kind: RopPeriodKind;
    /** Ключ: '2026-W46', '2026-11', '2026-Q4', '2026-H2', '2026'. */
    readonly key: string;
    /** Первый день периода. */
    readonly from: string;
    /** Последний день периода (включительно). */
    readonly to: string;
    /** Для людей: «10.11–16.11», «ноябрь 2026», «4 квартал 2026». */
    readonly label: string;
}

/** Период с моментами начала и конца в таймзоне портала. */
export interface RopPeriodWindow extends RopPeriod {
    /** Полночь первого дня. */
    readonly fromAt: Date;
    /** Полночь дня после последнего (не включая). */
    readonly toAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const KEY_PATTERNS: Readonly<Record<RopPeriodKind, RegExp>> = {
    [ROP_PERIOD_KIND.week]: /^(\d{4})-W(\d{2})$/,
    [ROP_PERIOD_KIND.month]: /^(\d{4})-(0[1-9]|1[0-2])$/,
    [ROP_PERIOD_KIND.quarter]: /^(\d{4})-Q([1-4])$/,
    [ROP_PERIOD_KIND.halfYear]: /^(\d{4})-H([12])$/,
    [ROP_PERIOD_KIND.year]: /^(\d{4})$/,
};

/** Месяцев в периоде (кроме недели). */
const MONTHS_IN: Readonly<
    Record<Exclude<RopPeriodKind, typeof ROP_PERIOD_KIND.week>, number>
> = {
    [ROP_PERIOD_KIND.month]: 1,
    [ROP_PERIOD_KIND.quarter]: 3,
    [ROP_PERIOD_KIND.halfYear]: 6,
    [ROP_PERIOD_KIND.year]: 12,
};

const RU_MONTHS = [
    'январь',
    'февраль',
    'март',
    'апрель',
    'май',
    'июнь',
    'июль',
    'август',
    'сентябрь',
    'октябрь',
    'ноябрь',
    'декабрь',
] as const;

const pad = (value: number): string => String(value).padStart(2, '0');

const formatUtcDay = (ms: number): string =>
    new Date(ms).toISOString().slice(0, 10);

/** День → полночь UTC; не день календаря (в том числе 30 февраля) — ошибка. */
function dayToUtc(day: string): number {
    const match = DAY_PATTERN.exec(day);
    const ms = match
        ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
        : Number.NaN;
    if (Number.isNaN(ms) || formatUtcDay(ms) !== day) {
        throw new RangeError(`Не календарный день: «${day}»`);
    }
    return ms;
}

const isoWeekdayOfMs = (ms: number): number =>
    ((new Date(ms).getUTCDay() + 6) % 7) + 1;

/** День, сдвинутый на `days` (отрицательное — назад). */
export function shiftRopDay(day: string, days: number): string {
    return formatUtcDay(dayToUtc(day) + days * DAY_MS);
}

/** ISO-день недели: 1 — понедельник … 7 — воскресенье. */
export function isoWeekdayOf(day: string): number {
    return isoWeekdayOfMs(dayToUtc(day));
}

/** Календарный день портала в момент `now`. */
export function ropPortalDay(now: Date, tz: ETimeZone): string {
    return dayjs(now).tz(tz).format('YYYY-MM-DD');
}

/** Час портала (0–23) в момент `now`. */
export function ropPortalHour(now: Date, tz: ETimeZone): number {
    return dayjs(now).tz(tz).hour();
}

export function isRopPeriodKind(value: unknown): value is RopPeriodKind {
    return (
        typeof value === 'string' &&
        (ROP_PERIOD_KINDS as readonly string[]).includes(value)
    );
}

/** Понедельник ISO-недели `week` года `year`, полночь UTC. */
function isoWeekMonday(year: number, week: number): number {
    const jan4 = Date.UTC(year, 0, 4);
    return jan4 - (isoWeekdayOfMs(jan4) - 1) * DAY_MS + (week - 1) * 7 * DAY_MS;
}

function isoWeekKey(day: string): string {
    const ms = dayToUtc(day);
    const thursday = ms + (4 - isoWeekdayOfMs(ms)) * DAY_MS;
    const year = new Date(thursday).getUTCFullYear();
    const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / DAY_MS / 7) + 1;
    return `${year}-W${pad(week)}`;
}

/** Ключ периода вида `kind`, в который попадает день. */
export function ropPeriodKey(kind: RopPeriodKind, day: string): string {
    if (kind === ROP_PERIOD_KIND.week) return isoWeekKey(day);
    dayToUtc(day);
    const year = Number(day.slice(0, 4));
    const month = Number(day.slice(5, 7));
    switch (kind) {
        case ROP_PERIOD_KIND.month:
            return `${year}-${pad(month)}`;
        case ROP_PERIOD_KIND.quarter:
            return `${year}-Q${Math.ceil(month / 3)}`;
        case ROP_PERIOD_KIND.halfYear:
            return `${year}-H${month <= 6 ? 1 : 2}`;
        default:
            return String(year);
    }
}

const ddmm = (day: string): string => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

function labelOf(
    kind: RopPeriodKind,
    year: number,
    index: number,
    from: string,
    to: string,
): string {
    switch (kind) {
        case ROP_PERIOD_KIND.week:
            return `${ddmm(from)}–${ddmm(to)}`;
        case ROP_PERIOD_KIND.month:
            return `${RU_MONTHS[index - 1]} ${year}`;
        case ROP_PERIOD_KIND.quarter:
            return `${index} квартал ${year}`;
        case ROP_PERIOD_KIND.halfYear:
            return `${index} полугодие ${year}`;
        default:
            return `${year} год`;
    }
}

/** Период по ключу; чужой или несуществующий ключ (2026-W54) — null. */
export function ropPeriodByKey(
    kind: RopPeriodKind,
    key: string,
): RopPeriod | null {
    const match = KEY_PATTERNS[kind].exec(key);
    if (!match) return null;
    const year = Number(match[1]);
    const index = match[2] === undefined ? 1 : Number(match[2]);
    if (kind === ROP_PERIOD_KIND.week) {
        if (index < 1) return null;
        const monday = formatUtcDay(isoWeekMonday(year, index));
        if (isoWeekKey(monday) !== key) return null;
        const sunday = shiftRopDay(monday, 6);
        return {
            kind,
            key,
            from: monday,
            to: sunday,
            label: labelOf(kind, year, index, monday, sunday),
        };
    }
    const months = MONTHS_IN[kind];
    const firstMonth =
        kind === ROP_PERIOD_KIND.month ? index : (index - 1) * months + 1;
    const lastMonth = firstMonth + months - 1;
    const from = `${year}-${pad(firstMonth)}-01`;
    const to = formatUtcDay(Date.UTC(year, lastMonth, 0));
    return { kind, key, from, to, label: labelOf(kind, year, index, from, to) };
}

/** Период вида `kind`, в который попадает день. */
export function ropPeriodOf(kind: RopPeriodKind, day: string): RopPeriod {
    const period = ropPeriodByKey(kind, ropPeriodKey(kind, day));
    if (!period) {
        throw new RangeError(`Период «${kind}» для дня «${day}» не вычислен`);
    }
    return period;
}

/** Прошлый период той же длины. */
export function previousRopPeriod(period: RopPeriod): RopPeriod {
    return ropPeriodOf(period.kind, shiftRopDay(period.from, -1));
}

/** Последний закрытый период вида `kind` на день `today` (не включая его период). */
export function lastClosedRopPeriod(
    kind: RopPeriodKind,
    today: string,
): RopPeriod {
    return previousRopPeriod(ropPeriodOf(kind, today));
}

/**
 * Тот же период год назад: октябрь 2026 → октябрь 2025, 2026-Q4 →
 * 2025-Q4. У недели пары нет (ISO-недели разных лет не совпадают по
 * дням) — null.
 */
export function sameRopPeriodYearAgo(period: RopPeriod): RopPeriod | null {
    if (period.kind === ROP_PERIOD_KIND.week) return null;
    const year = Number(period.key.slice(0, 4));
    return ropPeriodByKey(period.kind, `${year - 1}${period.key.slice(4)}`);
}

/** Моменты начала и конца периода в таймзоне портала. */
export function ropPeriodWindow(
    period: RopPeriod,
    tz: ETimeZone,
): RopPeriodWindow {
    const midnight = (day: string): Date =>
        dayjs.tz(`${day}T00:00:00`, tz).toDate();
    return {
        ...period,
        fromAt: midnight(period.from),
        toAt: midnight(shiftRopDay(period.to, 1)),
    };
}
