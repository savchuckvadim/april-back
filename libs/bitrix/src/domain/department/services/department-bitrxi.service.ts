import { BitrixService } from '@/modules/bitrix';
import { IBXDepartment, IBXUser } from '../../interfaces/bitrix.interface';

export class DepartmentBitrixService {
    constructor(private readonly bitrix: BitrixService) {}

    async getDepartmentsAll(): Promise<IBXDepartment[]> {
        const res = (await this.bitrix.api.call('department.get', {})) as {
            result: IBXDepartment[];
        };
        return res.result;
    }
    async getDepartments(
        filter: Record<string, unknown>,
    ): Promise<IBXDepartment[]> {
        const res = (await this.bitrix.api.call('department.get', filter)) as {
            result: IBXDepartment[];
        };
        return res.result;
    }

    async getUsersByDepartment(id: number) {
        const res = await this.bitrix.api.call('user.get', {
            FILTER: { UF_DEPARTMENT: id, ACTIVE: true },
            SELECT: [
                'ID',
                'NAME',
                'LAST_NAME',
                'EMAIL',
                'UF_DEPARTMENT',
                'UF_EMPLOYMENT_DATE',
                'UF_PHONE_INNER',
                'UF_USR_1570437798556',
                'USER_TYPE',
                'WORK_PHONE',
                'WORK_POSITION',
                'UF_HEAD_DEPARTMENT',
                'UF_DEPARTMENT_HEAD',
                'PERSONAL_PHOTO',
                'PERSONAL_WWW',
                'PERSONAL_BIRTHDAY',
                'PERSONAL_CITY',
                'PERSONAL_GENDER',
                'PERSONAL_MOBILE',
                'PERSONAL_PHONE',
                'PERSONAL_EMAIL',
                'PERSONAL_ADDRESS',
            ],
        });
        return res as { result: IBXUser[] };
    }

    async enrichWithUsers(
        departments: IBXDepartment[],
    ): Promise<IBXDepartment[]> {
        const enriched = [] as IBXDepartment[];

        for (const d of departments) {
            const users = (await this.getUsersByDepartment(d.ID)) as {
                result: IBXUser[];
            };
            enriched.push({ ...d, USERS: users.result });
        }

        return enriched;
    }
}
