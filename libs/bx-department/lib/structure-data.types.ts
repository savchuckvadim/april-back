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

/** Кешируемая часть структуры (без данных текущего пользователя). */
export interface IStructureData {
    department: {
        department: number;
        generalDepartment: IBXDepartment[];
        childrenDepartments: IBXDepartment[];
        allUsers: IBXUser[];
    };
    salesDepartments: ISalesDepartment[];
    /** Родительские отделы найденных ОП — для определения руководителя уровня cup. */
    cupDepartments: IBXDepartment[];
}
