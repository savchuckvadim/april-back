/**
 * Чистые построители ключей Redis-кэша модуля sales-finance.
 *
 * Схема ключей (читаемая, без хэшей — компоненты фиксированного формата):
 *   sales-finance:{domain}:closed:month:{yyyy-MM}:{empKey}  — сегмент прошлого месяца
 *   sales-finance:{domain}:closed:result:{from}_{to}_{empKey} — смёрженный итог
 *   sales-finance:{domain}:hot:{threshold}:{empKey}         — горячие клиенты
 */
import {
    SALES_FINANCE_CACHE_PREFIX,
    SALES_FINANCE_CACHE_SECTIONS,
    SalesFinanceCacheScope,
    SalesHotThreshold,
} from '../constants/sales-finance.const';

const EMPLOYEES_ALL = 'all';

/** Нормализация фильтра сотрудников: сортировка, дедуп; пусто → 'all'. */
export function buildEmployeesKey(assignedIds?: number[]): string {
    if (!assignedIds || assignedIds.length === 0) return EMPLOYEES_ALL;
    return [...new Set(assignedIds)].sort((a, b) => a - b).join('_');
}

export function buildClosedMonthKey(
    domain: string,
    month: string,
    assignedIds?: number[],
): string {
    const { CLOSED, MONTH } = SALES_FINANCE_CACHE_SECTIONS;
    return `${SALES_FINANCE_CACHE_PREFIX}:${domain}:${CLOSED}:${MONTH}:${month}:${buildEmployeesKey(assignedIds)}`;
}

export function buildClosedResultKey(
    domain: string,
    dateFrom: string,
    dateTo: string,
    assignedIds?: number[],
): string {
    const { CLOSED, RESULT } = SALES_FINANCE_CACHE_SECTIONS;
    return `${SALES_FINANCE_CACHE_PREFIX}:${domain}:${CLOSED}:${RESULT}:${dateFrom}_${dateTo}_${buildEmployeesKey(assignedIds)}`;
}

export function buildHotClientsKey(
    domain: string,
    threshold: SalesHotThreshold,
    assignedIds?: number[],
): string {
    const { HOT } = SALES_FINANCE_CACHE_SECTIONS;
    return `${SALES_FINANCE_CACHE_PREFIX}:${domain}:${HOT}:${threshold}:${buildEmployeesKey(assignedIds)}`;
}

/** SCAN-паттерн для сброса кэша по scope. */
export function buildResetPattern(
    domain: string,
    scope: SalesFinanceCacheScope,
): string {
    const { CLOSED, HOT } = SALES_FINANCE_CACHE_SECTIONS;
    if (scope === 'closed') {
        return `${SALES_FINANCE_CACHE_PREFIX}:${domain}:${CLOSED}:*`;
    }
    if (scope === 'hot') {
        return `${SALES_FINANCE_CACHE_PREFIX}:${domain}:${HOT}:*`;
    }
    return `${SALES_FINANCE_CACHE_PREFIX}:${domain}:*`;
}
