import { CallReportAnalyticsQueryDto } from '../dto/call-report-analytics-query.dto';

/** Поля строки, по которым работают фильтры запроса (полная и лёгкая строки). */
export interface AnalyticsFilterableRow {
    managerId: string | null;
    durationSec: number | null;
    callType: string | null;
}

/** Строки после фильтров + сколько отброшено из-за отсутствия менеджера. */
export interface AnalyticsFilterResult<T> {
    rows: T[];
    skippedNoManager: number;
}

/**
 * Допустимые менеджеры фильтра — объединение managerId и managerIds;
 * null — фильтра по менеджеру нет. Пустой managerIds без managerId —
 * фильтр «никто» (права доступа: у запросившего нет подчинённых → отчёт
 * пуст, а не по всему отделу).
 */
export function allowedManagers(
    query: CallReportAnalyticsQueryDto,
): Set<string> | null {
    if (query.managerId === undefined && query.managerIds === undefined) {
        return null;
    }
    const allowed = new Set<string>(query.managerIds ?? []);
    if (query.managerId !== undefined) allowed.add(query.managerId);
    return allowed;
}

/**
 * Фильтры запроса (менеджер, длительность, тип звонка). Строки без
 * сохранённого менеджера при фильтре по менеджеру отбрасываются и
 * считаются отдельно — число уходит в meta.skippedNoManager.
 */
export function filterAnalyticsRows<T extends AnalyticsFilterableRow>(
    rows: T[],
    query: CallReportAnalyticsQueryDto,
): AnalyticsFilterResult<T> {
    const allowed = allowedManagers(query);
    const passed: T[] = [];
    let skippedNoManager = 0;
    for (const row of rows) {
        if (!passesFilters(row, query, allowed)) {
            if (allowed !== null && row.managerId === null) skippedNoManager++;
            continue;
        }
        passed.push(row);
    }
    return { rows: passed, skippedNoManager };
}

function passesFilters(
    row: AnalyticsFilterableRow,
    query: CallReportAnalyticsQueryDto,
    allowed: Set<string> | null,
): boolean {
    if (
        allowed !== null &&
        (row.managerId === null || !allowed.has(row.managerId))
    ) {
        return false;
    }
    if (
        query.minDurationSec !== undefined &&
        (row.durationSec === null || row.durationSec < query.minDurationSec)
    ) {
        return false;
    }
    if (
        query.maxDurationSec !== undefined &&
        (row.durationSec === null || row.durationSec > query.maxDurationSec)
    ) {
        return false;
    }
    if (query.callType !== undefined && row.callType !== query.callType) {
        return false;
    }
    return true;
}
