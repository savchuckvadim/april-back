import { IBXDepartment, IBXUser } from '../../interfaces/bitrix.interface';
import { BitrixBaseApi } from '@/modules/bitrix/core/base/bitrix-base-api';

export class DepartmentBitrixService {
    constructor(private readonly bitrixApi: BitrixBaseApi) {}

    async getDepartmentsAll() {
        const res = await this.bitrixApi.call('department.get', {});
        return res.result;
    }
    async getDepartments(filter: any) {
        const res = await this.bitrixApi.call('department.get', filter);
        return res.result;
    }

    async getUsersByDepartment(id: number) {
        return await this.bitrixApi.call<IBXUser>('user.get', {
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
    }

    async enrichWithUsers(
        departments: IBXDepartment[],
    ): Promise<IBXDepartment[]> {
        const enriched = [] as IBXDepartment[];

        for (const d of departments) {
            const users = await this.getUsersByDepartment(d.ID);
            enriched.push({ ...d, USERS: users.result });
        }

        return enriched;
    }
}
