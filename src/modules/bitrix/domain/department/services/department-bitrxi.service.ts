import { Injectable } from "@nestjs/common";
import { BitrixApiService } from "src/modules/bitrix/api/bitrix-api.service";
import { IPortal } from "src/modules/portal/interfaces/portal.interface";
import { IBXDepartment, IBXUser } from "../../interfaces/bitrix.interface";

@Injectable()
export class DepartmentBitrixService {
  constructor(private readonly bitrix: BitrixApiService) {}

  async getDepartments(portal: IPortal, filter: any) {
    this.bitrix.initFromPortal(portal);
    const res = await this.bitrix.call('department.get', filter);
    return res.result;
  }

  async getUsersByDepartment(portal: IPortal, id: number) {
    this.bitrix.initFromPortal(portal);
    return await this.bitrix.call('user.get', {
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

  async enrichWithUsers(portal: IPortal, departments: any[]): Promise<IBXDepartment[]> {
    const enriched = [] as IBXDepartment[];

    for (const d of departments) {
      const users = await this.getUsersByDepartment(portal, d.ID);
      enriched.push({ ...d, USERS: users.result });
    }

    return enriched;
  }
}
