import { BxDocumentDeal } from 'generated/prisma';

/**
 * Библиотека заготовок конструктора — избранное и акции (решение владельца
 * 12): одна таблица bx_document_deals, различаются `kind`, видимость —
 * `visibility`. Здесь — чистые правила «кому что видно и кто что правит»;
 * роли приходят из структуры отделов (BxDepartmentStructureService).
 */

export const LIBRARY_KINDS = ['favorite', 'promotion'] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

/**
 * user — только автору; department — отделу продаж автора; portal — всему
 * порталу; global — всем порталам (акции вендора, portalId IS NULL, заводит
 * админка April).
 */
export const LIBRARY_VISIBILITIES = ['user', 'department', 'portal', 'global'] as const;
export type LibraryVisibility = (typeof LIBRARY_VISIBILITIES)[number];

/** Кто спрашивает: роль поверх структуры отделов портала. */
export interface LibraryActor {
    userId: number;
    /** Отдел продаж пользователя (id в Bitrix); null — вне структуры продаж */
    departmentId: number | null;
    /** Руководитель (группы/ОП/всех ОП) или поднят настройкой портала */
    isHead: boolean;
    /** Суперпользователь вендора (vendor_super_users) */
    isSuperUser: boolean;
}

const isLibraryKind = (value: unknown): value is LibraryKind =>
    typeof value === 'string' && (LIBRARY_KINDS as readonly string[]).includes(value);

const isLibraryVisibility = (value: unknown): value is LibraryVisibility =>
    typeof value === 'string' &&
    (LIBRARY_VISIBILITIES as readonly string[]).includes(value);

/**
 * Вид строки с учётом легаси: старое избранное Laravel (isFavorite=true,
 * kind NULL) читается как favorite (миграция данных без миграции БД).
 */
export const effectiveKind = (
    row: Pick<BxDocumentDeal, 'kind' | 'isFavorite'>,
): LibraryKind | null => {
    if (isLibraryKind(row.kind)) return row.kind;
    if (row.kind === null && row.isFavorite === true) return 'favorite';
    return null;
};

/** Видимость строки; у легаси-избранного и строк без значения — только автору. */
export const effectiveVisibility = (
    row: Pick<BxDocumentDeal, 'visibility' | 'portalId'>,
): LibraryVisibility => {
    if (isLibraryVisibility(row.visibility)) return row.visibility;
    // Laravel писал `all` для акций на все порталы
    if (row.visibility === 'all') return 'global';
    return 'user';
};

/** Автор строки: новые — creatorBxUserId, легаси-избранное — userId. */
export const authorOf = (
    row: Pick<BxDocumentDeal, 'creatorBxUserId' | 'userId'>,
): number | null => row.creatorBxUserId ?? row.userId ?? null;

/**
 * Какую видимость пользователь может назначить заготовке. Сотрудник — только
 * своё; руководитель и суперпользователь — отдел и портал (акции на портал —
 * тоже они). global заводит только админка April (здесь никому).
 */
export const allowedVisibilities = (
    actor: LibraryActor,
    kind: LibraryKind,
): LibraryVisibility[] => {
    const privileged = actor.isHead || actor.isSuperUser;
    if (!privileged) return kind === 'favorite' ? ['user'] : [];
    return actor.departmentId !== null
        ? ['user', 'department', 'portal']
        : ['user', 'portal'];
};

/** Видна ли строка пользователю (строки уже отфильтрованы по порталу/глобальные). */
export const isVisibleTo = (
    row: Pick<
        BxDocumentDeal,
        'kind' | 'isFavorite' | 'visibility' | 'portalId' | 'creatorBxUserId' | 'userId' | 'department' | 'isArchived'
    >,
    actor: LibraryActor,
): boolean => {
    if (row.isArchived) return false;
    if (effectiveKind(row) === null) return false;
    if (actor.isSuperUser) return true;
    switch (effectiveVisibility(row)) {
        case 'global':
        case 'portal':
            return true;
        case 'department':
            return (
                actor.departmentId !== null &&
                String(actor.departmentId) === String(row.department ?? '')
            );
        case 'user':
            return authorOf(row) === actor.userId;
    }
};

/**
 * Право править/удалять: автор — своё; руководитель и суперпользователь —
 * заготовки отдела и портала (чужое личное — нет); global — только админка.
 */
export const canEdit = (
    row: Pick<
        BxDocumentDeal,
        'kind' | 'isFavorite' | 'visibility' | 'portalId' | 'creatorBxUserId' | 'userId' | 'department'
    >,
    actor: LibraryActor,
): boolean => {
    const visibility = effectiveVisibility(row);
    if (visibility === 'global') return false;
    if (authorOf(row) === actor.userId) return true;
    if (visibility === 'user') return false;
    if (actor.isSuperUser) return true;
    if (!actor.isHead) return false;
    return visibility === 'portal'
        ? true
        : actor.departmentId !== null &&
              String(actor.departmentId) === String(row.department ?? '');
};
