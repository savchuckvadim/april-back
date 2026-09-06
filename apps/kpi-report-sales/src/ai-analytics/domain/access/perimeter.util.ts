import { AiAnalyticsRequesterRole } from '../../constants/ai-analytics.const';

/** Периметр видимости requester'а (план, 6.5). */
export interface RequesterAccess {
    role: AiAnalyticsRequesterRole;
    /** Bitrix-id менеджеров, чьи строки видны; null — все. */
    visibleManagerIds: string[] | null;
}

/**
 * Виден ли менеджер в периметре. Строки без менеджера (managerId = null)
 * видны только тем, кто видит всех — иначе менеджер мог бы увидеть чужой
 * звонок, обработанный до сохранения менеджера.
 */
export function isManagerVisible(
    access: RequesterAccess,
    managerId: string | null,
): boolean {
    if (access.visibleManagerIds === null) return true;
    return managerId !== null && access.visibleManagerIds.includes(managerId);
}

/** Фильтр строк с менеджером по периметру (чистая функция для presenter'ов). */
export function filterByPerimeter<T extends { managerId: string | null }>(
    rows: readonly T[],
    access: RequesterAccess,
): T[] {
    return rows.filter(row => isManagerVisible(access, row.managerId));
}
