import { CallV3ApiService } from '../../../../core/base/call-v3-api.service';
import {
    IBXHrEmployee,
    IBXHrMultidepartmentEmployee,
    IBXHrSubordinatesNode,
    THrEmployeeField,
} from '../../interfaces/hr.interface';
import { HR_EMPLOYEE } from '../schema/hr-employee.schema';

const DEFAULT_SELECT: THrEmployeeField[] = [
    'userId',
    'name',
    'workPosition',
    'avatar',
    'url',
    'departments',
    'teams',
];

/**
 * Поиск сотрудников в структуре компании (humanresources.employee.*).
 * Не injectable — создаётся на конкретный портал через BitrixV3Service.
 */
export class BxHrEmployeeService {
    constructor(private readonly api: CallV3ApiService) {}

    /** Поиск сотрудников по имени, опционально внутри узла */
    async search(
        name: string,
        nodeId?: number,
        select: THrEmployeeField[] = DEFAULT_SELECT,
    ): Promise<IBXHrEmployee[]> {
        const { items } = await this.api.call(HR_EMPLOYEE.SEARCH, {
            name,
            nodeId,
            select,
        });
        return items;
    }

    /** Отделы, в которых пользователь — руководитель, с числом подчинённых */
    async subordinates(userId: number): Promise<IBXHrSubordinatesNode[]> {
        const { departments } = await this.api.call(HR_EMPLOYEE.SUBORDINATES, {
            id: userId,
        });
        return departments;
    }

    /** Сотрудники, состоящие в нескольких отделах */
    async multidepartment(): Promise<IBXHrMultidepartmentEmployee[]> {
        const { employees } = await this.api.call(
            HR_EMPLOYEE.MULTIDEPARTMENT,
            {},
        );
        return employees;
    }

    /** Общее число сотрудников в структуре */
    async count(): Promise<number> {
        const { total } = await this.api.call(HR_EMPLOYEE.COUNT, {});
        return total;
    }
}
