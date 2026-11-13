import type { AdminFacetValueDto } from './admin-facet.dto';

/**
 * Общие правила постраничных списков админки (транскрипции, AI-записи):
 * пределы страницы, границы дней по Москве, значения фильтров. Чистые
 * функции без DI и Prisma.
 */

/** Пределы страницы списка. */
export interface AdminPageLimits {
    defaultPageSize: number;
    maxPageSize: number;
}

/** Номер и размер страницы с дефолтами и пределами. */
export function adminPageBounds(
    query: { page?: number; pageSize?: number },
    limits: AdminPageLimits,
): { page: number; pageSize: number } {
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const pageSize = Math.min(
        limits.maxPageSize,
        Math.max(1, Math.floor(query.pageSize ?? limits.defaultPageSize)),
    );
    return { page, pageSize };
}

/** Смещение Москвы от UTC, часов. */
const MOSCOW_OFFSET_HOURS = 3;

/** Начало дня по Москве (YYYY-MM-DD) в UTC; кривой день — null. */
export function moscowDayStart(day: string | undefined): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? '');
    if (!match) return null;
    const date = new Date(
        Date.UTC(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3]),
            -MOSCOW_OFFSET_HOURS,
        ),
    );
    return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Условие по дате создания для «с дня по день» (по Москве, оба
 * включительно); ни одной границы — undefined (условия нет).
 */
export function moscowDayRange(
    dateFrom: string | undefined,
    dateTo: string | undefined,
): { gte?: Date; lt?: Date } | undefined {
    const from = moscowDayStart(dateFrom);
    const toStart = moscowDayStart(dateTo);
    const to = toStart ? new Date(toStart.getTime() + 86_400_000) : null;
    if (!from && !to) return undefined;
    return { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) };
}

/**
 * Значения фильтра из группировки Prisma: пустые отброшены, сначала самые
 * частые, при равенстве — по алфавиту.
 */
export function facetValues(
    groups: readonly { value: string | null; count: number }[],
): AdminFacetValueDto[] {
    return groups
        .filter(
            (group): group is { value: string; count: number } =>
                typeof group.value === 'string' && group.value.trim() !== '',
        )
        .map(group => ({ value: group.value, count: group.count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** Число из строковой колонки (длительность, символы); не число — null. */
export function numberOrNull(raw: string | null | undefined): number | null {
    if (raw === null || raw === undefined || raw.trim() === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
}
