import {
    EDepartamentGroup,
    IPortal,
} from '@lib/portal-lib/portal/interfaces/portal.interface';
import { tagCacheKey } from './department-match.util';

/**
 * Режим сборки отдела группы — чистые функции BxDepartmentService:
 * один базовый отдел из конфига портала или все ОП по тэгу со всей
 * структуры (мультирежим).
 */

/** Режим отдела группы из локальной модели портала (БД). */
export interface DepartmentMode {
    readonly isMultiple: boolean;
    /** Тэг поиска отделов в мультирежиме; null — шаблоны группы. */
    readonly multipleTag: string | null;
}

/** Часть ключа кэша: разные режимы и тэги — разные наборы отделов. */
export type DepartmentModeCacheKey = 'single' | `multi_${string}`;

/**
 * Флаг `is_multiple`: Prisma отдаёт boolean, но копии портала из
 * Laravel/JSON приносят 1/0 — строго приводим, «0» не должен стать true.
 */
const toFlag = (raw: unknown): boolean =>
    raw === true || raw === 1 || raw === '1';

/**
 * Мультирежим и тэг поиска — из БД (`departaments.is_multiple` /
 * `multiple_tag` локальной модели портала), а не из внешнего запроса.
 * Нет локальной модели или отдела группы — одиночный режим.
 */
export const resolveDepartmentMode = (
    internalPortal: Pick<IPortal, 'departaments'> | undefined,
    group: EDepartamentGroup,
): DepartmentMode => {
    const department = internalPortal?.departaments?.find(
        d => d.group === group,
    );
    return {
        isMultiple: toFlag(department?.is_multiple),
        multipleTag: department?.multiple_tag ?? null,
    };
};

export const departmentModeCacheKey = (
    mode: DepartmentMode,
): DepartmentModeCacheKey =>
    mode.isMultiple ? `multi_${tagCacheKey(mode.multipleTag)}` : 'single';
