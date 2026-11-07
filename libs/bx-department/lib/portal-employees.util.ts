import type {
    IBXDepartment,
    IBXUser,
} from '@lib/bitrix/domain/interfaces/bitrix.interface';

/** Сотрудник портала для выбора в админке. */
export interface PortalEmployee {
    id: number;
    /** «Фамилия Имя»; без имени в Битриксе — «Сотрудник {id}». */
    name: string;
    position: string | null;
    /** Названия отделов сотрудника в порядке UF_DEPARTMENT. */
    departments: string[];
}

/** Типы пользователей Битрикса, которых в списке нет: внешние и служебные. */
const NOT_EMPLOYEE_TYPES: ReadonlySet<string> = new Set([
    'extranet',
    'email',
    'bot',
    'imconnector',
    'replica',
    'shop',
    'sale',
    'saleanonymous',
]);

/**
 * Список сотрудников портала из `user.get` и `department.get`: только
 * сотрудники (экстранет, почтовые и служебные пользователи отброшены),
 * названия отделов вместо id, сортировка по имени по-русски. Чистая
 * функция — без DI и Битрикса.
 */
export function toPortalEmployees(
    users: readonly IBXUser[],
    departments: readonly IBXDepartment[],
): PortalEmployee[] {
    const departmentNames = new Map(
        departments.map(item => [Number(item.ID), item.NAME]),
    );
    return users
        .filter(
            user =>
                Number(user.ID) > 0 &&
                !NOT_EMPLOYEE_TYPES.has((user.USER_TYPE ?? '').toLowerCase()),
        )
        .map(user => toEmployee(user, departmentNames))
        .sort(
            (a, b) =>
                a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' }) ||
                a.id - b.id,
        );
}

function toEmployee(
    user: IBXUser,
    departmentNames: ReadonlyMap<number, string>,
): PortalEmployee {
    const id = Number(user.ID);
    const name = [user.LAST_NAME, user.NAME]
        .map(part => (part ?? '').trim())
        .filter(Boolean)
        .join(' ');
    const position = (user.WORK_POSITION ?? '').trim();
    return {
        id,
        name: name || `Сотрудник ${id}`,
        position: position || null,
        departments: (user.UF_DEPARTMENT ?? []).flatMap(departmentId => {
            const title = departmentNames.get(Number(departmentId));
            return title ? [title] : [];
        }),
    };
}
