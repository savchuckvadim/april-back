import {
    IBXDepartment,
    IBXUser,
} from 'src/modules/bitrix/domain/interfaces/bitrix.interface';

/** Разбивка по одному отделу продаж (внутренний тип, структурно равен BxSalesDepartmentDto). */
export interface ISalesDepartment {
    department: IBXDepartment;
    groups: IBXDepartment[];
    allUsers: IBXUser[];
}

/**
 * Дерево отделов группы, как его загрузил DepartmentTreeLoader
 * (сотрудники — у каждого отдела, руководители ещё не подмешаны).
 * Одиночный режим: базовый отдел, его подотделы и родители; мультирежим:
 * все ОП, их подотделы и предки каждого ОП.
 */
export interface IDepartmentTree {
    general: IBXDepartment[];
    children: IBXDepartment[];
    parents: IBXDepartment[];
}

/**
 * Снимок отдела группы — ответ getFullDepartment во внутренних типах
 * (кэш Redis, `department_*_v4`). Из него же проекцией строится структура
 * BxDepartmentStructureService, поэтому её подчинённые ⊆ allUsers.
 */
export interface IDepartmentData {
    /**
     * Bitrix ID базового отдела из конфига портала (конфига нет — поля
     * нет, как и раньше); 0 в мультирежиме — единого корня нет.
     */
    department?: number;
    generalDepartment: IBXDepartment[];
    childrenDepartments: IBXDepartment[];
    /** Одиночный режим — родители базового; мультирежим — предки всех ОП. */
    parentDepartments?: IBXDepartment[];
    allUsers: IBXUser[];
    isMultiple?: boolean;
    multipleTag?: string | null;
}

/** Структура отделов продаж без данных текущего пользователя (проекция снимка). */
export interface IStructureData {
    department: IDepartmentData;
    salesDepartments: ISalesDepartment[];
    /** Родительские отделы найденных ОП — для определения руководителя уровня cup. */
    cupDepartments: IBXDepartment[];
}
