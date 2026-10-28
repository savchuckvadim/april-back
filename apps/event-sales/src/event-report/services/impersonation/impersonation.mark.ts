import { ActingManagerMark } from '../acting-manager/acting-manager.mark';

/**
 * Режим «работать как» — чистые данные и подписи.
 *
 * Суперпользователь April открывает «Звонки» от имени сотрудника, и отчёт
 * уходит как обычный отчёт сотрудника: ни пометок на портале, ни
 * уведомлений (просьба владельца 28.10.2026 — «полная имитация»). Кто
 * работал на самом деле, остаётся одной строкой в журнале сервера.
 */
export interface ImpersonationCheck {
    /** Bitrix ID суперпользователя — того, кто фактически отправил отчёт. */
    readonly superUserId: number;
    /** Имя из запроса; пустое — подпись с ID. */
    readonly name: string;
    /** Сотрудник, от имени которого открыто приложение. */
    readonly asUserId: number;
    /** На кого записан отчёт (может быть подчинённый сотрудника). */
    readonly responsibleId: number;
    /** Отправитель найден в списке суперпользователей портала. */
    readonly isConfirmed: boolean;
}

/** Контекст строки журнала: по нему ищут в журнале админки. */
export const IMPERSONATION_LOG_CONTEXT = 'Impersonation';

const toId = (raw: unknown): number => {
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : 0;
};

/** Сырые поля отчёта, из которых собирается проверка. */
export interface ImpersonationSource {
    impersonatedBy?: { ID?: unknown; NAME?: string } | null;
    actingManager?: { ID?: unknown } | null;
    plan?: { responsibility?: { ID?: unknown } | null } | null;
}

/**
 * Проверка без роли; null — отчёт обычный.
 *
 * От чьего имени открыто приложение: пометка режима руководителя (её
 * ставит само приложение сотрудника, когда он отчитывается за
 * подчинённого или жмёт быстрый итог) — иначе ответственный плана.
 */
export const impersonationFromDto = (
    dto: ImpersonationSource,
    isConfirmed: boolean,
): ImpersonationCheck | null => {
    const superUserId = toId(dto.impersonatedBy?.ID);
    if (!superUserId) return null;
    const responsibleId = toId(dto.plan?.responsibility?.ID);
    return {
        superUserId,
        name: dto.impersonatedBy?.NAME?.trim() ?? '',
        asUserId: toId(dto.actingManager?.ID) || responsibleId,
        responsibleId,
        isConfirmed,
    };
};

/**
 * Видимая пометка вместо тихой: отправитель не суперпользователь — значит,
 * спрятать себя он права не имеет, и отчёт подписывается как от любого
 * сотрудника («Отчёт отправил: …»). Отчёт за самого себя — без пометки.
 */
export const impersonationVisibleMark = (
    check: ImpersonationCheck,
): ActingManagerMark | null => {
    if (check.isConfirmed) return null;
    if (!check.responsibleId || check.responsibleId === check.superUserId) {
        return null;
    }
    return {
        id: check.superUserId,
        name: check.name,
        isConfirmedHead: false,
    };
};

/** Строка журнала: кто, как кто, на кого записан отчёт, по какому делу. */
export const impersonationLogLine = (
    domain: string,
    check: ImpersonationCheck,
    taskId: number,
): string => {
    const who = check.name
        ? `${check.name} (#${check.superUserId})`
        : `#${check.superUserId}`;
    const role = check.isConfirmed
        ? 'суперпользователь'
        : 'НЕ суперпользователь — пометка видна';
    const parts = [
        `[${domain}] ${who}, ${role}: отчёт как сотрудник #${check.asUserId}`,
    ];
    if (check.responsibleId && check.responsibleId !== check.asUserId) {
        parts.push(`записан на #${check.responsibleId}`);
    }
    parts.push(taskId ? `дело #${taskId}` : 'новое дело');
    return parts.join(', ');
};
