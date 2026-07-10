import {
    IBXHrEmployee,
    IBXHrMultidepartmentEmployee,
    IBXHrSubordinatesNode,
    THrEmployeeField,
} from '../../interfaces/hr.interface';

/** Константы методов поиска сотрудников в структуре */
export const HR_EMPLOYEE = {
    SEARCH: 'humanresources.employee.search',
    SUBORDINATES: 'humanresources.employee.subordinates',
    MULTIDEPARTMENT: 'humanresources.employee.multidepartment',
    COUNT: 'humanresources.employee.count',
} as const;

/** Схема методов humanresources.employee.* */
export interface HrEmployeeMethods {
    'humanresources.employee.search': {
        request: {
            /** Строка поиска по имени */
            name: string;
            /** Ограничить поиск отделом или командой */
            nodeId?: number;
            select?: THrEmployeeField[];
        };
        response: { items: IBXHrEmployee[] };
    };
    'humanresources.employee.subordinates': {
        request: { id: number };
        response: {
            userId: number;
            departments: IBXHrSubordinatesNode[];
        };
    };
    'humanresources.employee.multidepartment': {
        request: Record<string, never>;
        response: {
            employees: IBXHrMultidepartmentEmployee[];
            total: number;
        };
    };
    'humanresources.employee.count': {
        request: Record<string, never>;
        response: { total: number };
    };
}
