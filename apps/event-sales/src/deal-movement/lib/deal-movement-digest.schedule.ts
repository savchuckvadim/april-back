/**
 * Календарь сводки за период (раз в неделю / две недели, решение владельца
 * 20.11.2026) — чистые функции. День — день портала 'YYYY-MM-DD' ночного
 * счёта; отметка прошлой сводки — в Redis.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Последняя сводка за период: день портала и момент отправки. */
export interface DealMovementPeriodDigestMark {
    /** День портала 'YYYY-MM-DD'. */
    readonly day: string;
    /** Момент отметки, ISO. */
    readonly at: string;
}

/** ISO-день недели дня 'YYYY-MM-DD': 1 — понедельник … 7 — воскресенье. */
export const isoWeekdayOfDay = (day: string): number => {
    const weekday = new Date(`${day}T00:00:00.000Z`).getUTCDay();
    return weekday === 0 ? 7 : weekday;
};

/** Дней между днями портала (b − a). */
const daysBetween = (a: string, b: string): number =>
    Math.round(
        (Date.parse(`${b}T00:00:00.000Z`) - Date.parse(`${a}T00:00:00.000Z`)) /
            DAY_MS,
    );

/**
 * Пора ли сводке за период: сегодня выбранный день недели и с прошлой
 * сводки прошло не меньше периода (7 или 14 дней). Сводки ещё не было —
 * пора в первый же выбранный день.
 */
export function isDealMovementPeriodDigestDue(input: {
    /** День портала 'YYYY-MM-DD'. */
    readonly day: string;
    /** Выбранный день недели (1–7). */
    readonly weekday: number;
    readonly periodDays: number;
    readonly last: DealMovementPeriodDigestMark | null;
}): boolean {
    if (isoWeekdayOfDay(input.day) !== input.weekday) return false;
    return (
        input.last === null ||
        daysBetween(input.last.day, input.day) >= input.periodDays
    );
}

/**
 * С какого момента считать «что изменилось»: прошлая сводка, а без неё —
 * начало периода (день минус длина периода), мс.
 */
export function dealMovementPeriodSinceMs(
    day: string,
    periodDays: number,
    last: DealMovementPeriodDigestMark | null,
): number {
    const lastMs = last === null ? Number.NaN : Date.parse(last.at);
    return Number.isNaN(lastMs)
        ? Date.parse(`${day}T00:00:00.000Z`) - periodDays * DAY_MS
        : lastMs;
}

/**
 * С какого дня портала период в заголовке: день прошлой сводки, а без
 * неё — день минус длина периода.
 */
export function dealMovementPeriodFromDay(
    day: string,
    periodDays: number,
    last: DealMovementPeriodDigestMark | null,
): string {
    if (last !== null) return last.day;
    return new Date(Date.parse(`${day}T00:00:00.000Z`) - periodDays * DAY_MS)
        .toISOString()
        .slice(0, 10);
}

/** Отметка из Redis → последняя сводка; чужая форма — null. */
export function parseDealMovementPeriodDigestMark(
    raw: string | null,
): DealMovementPeriodDigestMark | null {
    if (!raw) return null;
    try {
        const value: unknown = JSON.parse(raw);
        if (typeof value !== 'object' || value === null) return null;
        const { day, at } = value as Record<string, unknown>;
        return typeof day === 'string' && typeof at === 'string'
            ? { day, at }
            : null;
    } catch {
        return null;
    }
}
