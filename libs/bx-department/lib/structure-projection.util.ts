import { IBXDepartment } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import { collectUsers, isGroupName } from './department-match.util';
import { uniqueById } from './department-tree.util';
import { IDepartmentData, IStructureData } from './structure-data.types';

/**
 * Структура отделов продаж — чистая проекция снимка отдела
 * (BxDepartmentService.getFullDepartment): те же отделы, сотрудники и
 * руководители. Поэтому подчинённые любого пользователя структуры по
 * построению входят в allUsers снимка.
 */

/** Одиночный режим (как раньше): базовый отдел, группы — подотделы «Группа …». */
const projectSingle = (snapshot: IDepartmentData): IStructureData => ({
    department: snapshot,
    salesDepartments: snapshot.generalDepartment.map(department => ({
        department,
        groups: snapshot.childrenDepartments.filter(d => isGroupName(d.NAME)),
        allUsers: snapshot.allUsers,
    })),
    cupDepartments: [],
});

/**
 * Уровень cup — прямые родители найденных ОП (с сотрудниками и
 * руководителями снимка). Родителем может оказаться и сам ОП, если он
 * вложен в другой ОП.
 */
const cupDepartmentsOf = (snapshot: IDepartmentData): IBXDepartment[] => {
    const ops = snapshot.generalDepartment;
    const isOpParent = (d: IBXDepartment) =>
        ops.some(op => Number(op.PARENT) === Number(d.ID));
    return uniqueById(
        [...(snapshot.parentDepartments ?? []), ...ops].filter(isOpParent),
    );
};

/** Мультирежим: разбивка по каждому найденному ОП. */
const projectMultiple = (snapshot: IDepartmentData): IStructureData => {
    const childrenOf = (op: IBXDepartment) =>
        snapshot.childrenDepartments.filter(
            d => Number(d.PARENT) === Number(op.ID),
        );
    return {
        department: snapshot,
        salesDepartments: snapshot.generalDepartment.map(op => ({
            department: op,
            // группами считаются только «Группа…», но сотрудники
            // прочих подотделов остаются в allUsers отдела
            groups: childrenOf(op).filter(d => isGroupName(d.NAME)),
            allUsers: collectUsers([op, ...childrenOf(op)]),
        })),
        cupDepartments: cupDepartmentsOf(snapshot),
    };
};

export const toStructureData = (snapshot: IDepartmentData): IStructureData =>
    snapshot.isMultiple ? projectMultiple(snapshot) : projectSingle(snapshot);
