import { toId } from './department-heads.util';

/** Сотрудник отдела в снимке структуры (структурно = IBXUser). */
export interface NamedDepartmentUser {
    readonly ID?: number | string;
    readonly NAME?: string | null;
    readonly LAST_NAME?: string | null;
}

/** Отдел снимка со списком сотрудников (структурно = IBXDepartment). */
export interface NamedDepartmentLike {
    readonly USERS?: readonly NamedDepartmentUser[] | null;
}

const clean = (value: string | null | undefined): string =>
    (value ?? '').replace(/\s+/g, ' ').trim();

/**
 * Имена сотрудников из снимка структуры — «Фамилия Имя», без вызовов
 * портала: снимок уже содержит USERS с именами. Первое вхождение
 * сотрудника побеждает; без имени и фамилии сотрудника в карте нет —
 * подпись по умолчанию выбирает вызывающий.
 */
export function userNamesOf(
    departments: readonly NamedDepartmentLike[],
): Map<number, string> {
    const names = new Map<number, string>();
    for (const department of departments) {
        for (const user of department.USERS ?? []) {
            const id = toId(user.ID);
            if (id === null || names.has(id)) continue;
            const name = [clean(user.LAST_NAME), clean(user.NAME)]
                .filter(Boolean)
                .join(' ');
            if (name) names.set(id, name);
        }
    }
    return names;
}
