import { IBXDepartment } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import { toPositiveInt } from './department-heads.util';
import { matchesName } from './department-match.util';
import { IDepartmentTree } from './structure-data.types';

/**
 * Дерево отделов по данным department.get — чистые функции
 * DepartmentTreeLoader: выбор ОП мультирежима и подъём к предкам.
 */

/** Предохранитель климба вверх по PARENT: выше трёх уровней не поднимаемся. */
export const PARENT_CLIMB_LIMIT = 3;

/**
 * Поиск отдела по ID: HTTP-запрос (одиночный режим) или карта всех
 * отделов портала (мультирежим). undefined — отдела нет или он не прочитан.
 */
export type DepartmentLookup = (
    id: number,
) => Promise<IBXDepartment | undefined>;

/**
 * Мультирежим: ОП — все отделы, чьё название подходит под шаблоны группы
 * или тэга; подотделы — все отделы, чей родитель — любой ОП (и негрупповые,
 * и ОП, вложенный в другой ОП: их сотрудники остаются в allUsers отдела).
 */
export const selectMultipleTree = (
    all: readonly IBXDepartment[],
    patterns: RegExp[],
): Pick<IDepartmentTree, 'general' | 'children'> => {
    const general = all.filter(d => matchesName(d.NAME, patterns));
    const children = all.filter(d =>
        general.some(op => Number(d.PARENT) === Number(op.ID)),
    );
    return { general, children };
};

/**
 * Предки каждого стартового отдела до `limit` уровней вверх по PARENT:
 * без дублей по ID и без самих стартовых отделов. Через общего предка
 * подъём продолжается (у каждой ветки свой лимит уровней), цикл PARENT
 * обрывает ветку. Поиск вернул undefined — ветка тоже обрывается.
 * Уже известные отделы (найденные и стартовые) повторно не ищутся —
 * в одиночном режиме поиск идёт HTTP-запросами.
 */
export const climbParents = async (
    start: readonly IBXDepartment[],
    findById: DepartmentLookup,
    limit: number = PARENT_CLIMB_LIMIT,
): Promise<IBXDepartment[]> => {
    const startById = new Map(start.map(d => [Number(d.ID), d]));
    const found = new Map<number, IBXDepartment>();

    for (const department of start) {
        const branch = new Set<number>([Number(department.ID)]);
        let parentId = toPositiveInt(department.PARENT);
        for (let level = 0; level < limit; level++) {
            // корень (PARENT пуст/0) или цикл в ветке
            if (parentId === null || branch.has(parentId)) break;
            branch.add(parentId);

            const parent =
                found.get(parentId) ??
                startById.get(parentId) ??
                (await findById(parentId));
            if (!parent) break;
            if (!startById.has(parentId)) found.set(parentId, parent);
            parentId = toPositiveInt(parent.PARENT);
        }
    }
    return [...found.values()];
};

/** Отделы без дублей по ID, порядок первого появления сохраняется. */
export const uniqueById = (
    departments: readonly IBXDepartment[],
): IBXDepartment[] => {
    const seen = new Set<number>();
    return departments.filter(d => {
        const id = Number(d.ID);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });
};
