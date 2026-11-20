import {
    isManagerVisible,
    normalizeUserId,
    type RequesterAccess,
} from '../domain/access/perimeter.util';

/** Кого показывает витрина: периметр пользователя ∩ выбранные менеджеры. */
export interface DealMovementScope {
    /**
     * Пользователь видит всех и фильтра нет: итог отдела — итог портала
     * (с сделками без ответственного и звонками без менеджера).
     */
    readonly whole: boolean;
    /** Виден ли менеджер (null — без менеджера: только при `whole`). */
    visible(managerId: string | null): boolean;
}

/**
 * Периметр пользователя и фильтр запроса → правило видимости. Чужие id
 * фильтра просто ничего не добавляют (пересечение с периметром).
 */
export function dealMovementScopeOf(
    access: RequesterAccess,
    managerIds: readonly string[] | undefined,
): DealMovementScope {
    const filter = (managerIds ?? [])
        .map(id => normalizeUserId(id))
        .filter((id): id is string => id !== null);
    const selected = filter.length > 0 ? new Set(filter) : null;
    return {
        whole: access.visibleManagerIds === null && selected === null,
        visible: (managerId: string | null): boolean =>
            isManagerVisible(access, managerId) &&
            (selected === null ||
                (managerId !== null && selected.has(managerId))),
    };
}
