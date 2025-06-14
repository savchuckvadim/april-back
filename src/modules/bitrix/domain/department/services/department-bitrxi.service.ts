import { Injectable } from "@nestjs/common";
import { BitrixRequestApiService } from "src/modules/bitrix/core/http/bitrix-request-api.service";
import { IBXDepartment, IBXUser } from "../../interfaces/bitrix.interface";

@Injectable()
export class DepartmentBitrixService {
  constructor(
    private readonly bitrixApi: BitrixRequestApiService
  ) { }

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

      ]
    });
  }

  async enrichWithUsers(departments: IBXDepartment[]): Promise<IBXDepartment[]> {
    const enriched = [] as IBXDepartment[];

    for (const d of departments) {
      const users = await this.getUsersByDepartment(d.ID);
      enriched.push({ ...d, USERS: users.result });
    }

    return enriched;
  }
}
