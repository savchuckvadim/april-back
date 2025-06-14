import { Injectable } from "@nestjs/common";
import dayjs from "dayjs";
import Redis from "ioredis";
import { RedisService } from "src/core/redis/redis.service";
import { IBXUser } from "src/modules/bitrix/domain/interfaces/bitrix.interface";
import { EDepartamentGroup } from "src/modules/portal/interfaces/portal.interface";
import { DepartmentBitrixService } from "@/modules/bitrix/domain/department/services/department-bitrxi.service";
import { PBXService } from "@/modules/pbx";
import { PortalModel } from "@/modules/portal/services/portal.model";


// C:\Projects\April-KP\april-next\back\src\modules\bitrix\endpoints\department\services\department-resolver-bitrxi.service.ts
@Injectable()
export class BxDepartmentService {
  private readonly redis: Redis;

  constructor(

    private readonly redisService: RedisService,
    // private readonly portalContext: PortalContextService
    private readonly pbx: PBXService

  ) {

    this.redis = this.redisService.getClient()
  }

  async getFullDepartment(domain: string, group: EDepartamentGroup | undefined) {
    const { bitrix, PortalModel } = await this.pbx.init(domain);

    const targetGroup = this.getTargetGroup(group);
    const baseDepartmentBitrixId = this.getBaseDepartmentIdByGroup(targetGroup, PortalModel);
    const day = dayjs().format('MMDD');
    const sessionKey = `department_${domain}_${day}_${targetGroup}`;

    const fromCache = await this.redis.get(sessionKey);
    if (fromCache) return JSON.parse(fromCache);

    const departmentService = new DepartmentBitrixService(bitrix.api);

    const general = await departmentService.getDepartments({ ID: baseDepartmentBitrixId });
    const children = await departmentService.getDepartments({ PARENT: baseDepartmentBitrixId });

    const generalWithUsers = await departmentService.enrichWithUsers(general);
    const childrenWithUsers = await departmentService.enrichWithUsers(children);

    const allUsers: IBXUser[] = []
    const allDepartments = [...generalWithUsers, ...childrenWithUsers]
    allDepartments.map(d => d?.USERS?.map(u => {

      if (u) {
        allUsers.push(u)
      }
    }));

    const result = {
      department: {
        department: baseDepartmentBitrixId,
        generalDepartment: generalWithUsers,
        childrenDepartments: childrenWithUsers,
        allUsers,
      }
    };

    await this.redis.set(sessionKey, JSON.stringify(result));
    return result;
  }

  private getBaseDepartmentIdByGroup(group: EDepartamentGroup | undefined, portal: PortalModel) {
    const targetGroup = this.getTargetGroup(group);
    if (targetGroup === EDepartamentGroup.sales) {

      const baseDepartmentBitrix = portal.getDepartamentIdByCode(targetGroup);
      return baseDepartmentBitrix?.bitrixId
    } else {
      return 9
    }

  }

  private getTargetGroup(group: EDepartamentGroup | undefined) {
    const targetGroup = group || EDepartamentGroup.sales;
    return targetGroup;
  }
}
