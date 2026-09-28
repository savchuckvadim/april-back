import {
    IBXDepartment,
    IBXUser,
} from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import { EBxVisibilityLevel } from '../dto/bx-department-structure.dto';
import { toPositiveInt } from './department-heads.util';
import { ISalesDepartment, IStructureData } from './structure-data.types';

/** Роль, по которой считается периметр: уровень + отделы этого уровня. */
export interface SubordinatePerimeter {
    visibility: EBxVisibilityLevel;
    headOfDepartmentIds: readonly number[];
}

const userIdsOf = (users: readonly IBXUser[] | null | undefined): number[] =>
    (users ?? [])
        .map(user => toPositiveInt(user?.ID))
        .filter((id): id is number => id !== null);

const hasId = (department: IBXDepartment, ids: readonly number[]): boolean =>
    ids.includes(Number(department.ID));

const usersOfGroups = (
    departments: readonly ISalesDepartment[],
    groupIds: readonly number[],
): number[] =>
    departments
        .flatMap(sales => sales.groups)
        .filter(group => hasId(group, groupIds))
        .flatMap(group => userIdsOf(group.USERS));

const usersOfDepartments = (
    departments: readonly ISalesDepartment[],
    opIds: readonly number[],
): number[] =>
    departments
        .filter(sales => hasId(sales.department, opIds))
        .flatMap(sales => userIdsOf(sales.allUsers));

/**
 * Подчинённые пользователя — те, чью работу он видит как руководитель.
 *
 * Периметр совпадает с видимостью в отчётах продаж (решение владельца
 * 28.09.2026): руководитель группы — свою группу, отдела — отдел со всеми
 * группами, главный — всю структуру. Принудительная видимость из настроек
 * портала и суперпользователь вендора уже учтены в `visibility`.
 *
 * Сам пользователь в список не входит: «подчинённый самому себе» сломал бы
 * правило «за себя в режиме руководителя не работают».
 */
export const subordinateIdsOf = (
    structure: IStructureData,
    perimeter: SubordinatePerimeter,
    userId: number,
): number[] => {
    const departments = structure.salesDepartments;
    const ids = perimeter.headOfDepartmentIds;

    let found: number[] = [];
    switch (perimeter.visibility) {
        case EBxVisibilityLevel.all:
            found = departments.flatMap(sales => userIdsOf(sales.allUsers));
            break;
        case EBxVisibilityLevel.department:
            found = usersOfDepartments(departments, ids);
            break;
        case EBxVisibilityLevel.group:
            found = usersOfGroups(departments, ids);
            break;
        default:
            found = [];
    }

    return [...new Set(found)]
        .filter(id => id !== Number(userId))
        .sort((left, right) => left - right);
};
