import { Injectable } from "@nestjs/common";
import dayjs from "dayjs";
import Redis from "ioredis";
import { RedisService } from "src/core/redis/redis.service";
import { DepartmentBitrixService } from "src/modules/bitrix/domain/department/services/department-bitrxi.service";
import { IBXUser } from "src/modules/bitrix/domain/interfaces/bitrix.interface";
import { EDepartamentGroup, IPortal, } from "src/modules/portal/interfaces/portal.interface";
import { PortalContextService } from "src/modules/portal/services/portal-context.service";


// C:\Projects\April-KP\april-next\back\src\modules\bitrix\endpoints\department\services\department-resolver-bitrxi.service.ts
@Injectable()
export class DepartmentResolverService {
  private readonly redis: Redis;

  constructor(
    private readonly bitrixService: DepartmentBitrixService,
    private readonly redisService: RedisService,
    private readonly portalContext: PortalContextService

  ) {

    this.redis = this.redisService.getClient()
  }
  
  async getFullDepartment(domain: string, group: EDepartamentGroup) {
    const day = dayjs().format('MMDD');
    const sessionKey = `department_${domain}_${day}`;
    const fromCache = await this.redis.get(sessionKey);
    if (fromCache) return JSON.parse(fromCache);

    const portal =  this.portalContext.getModel();
    const baseDepartmentBitrix = portal.getDepartamentIdByCode(group);
    
    const baseDepartmentBitrixId = baseDepartmentBitrix?.bitrixId

    
    const general = await this.bitrixService.getDepartments({ ID: baseDepartmentBitrixId });
    const children = await this.bitrixService.getDepartments({ PARENT: baseDepartmentBitrixId });

    const generalWithUsers = await this.bitrixService.enrichWithUsers( general);
    const childrenWithUsers = await this.bitrixService.enrichWithUsers( children);

    const allUsers: IBXUser[] = []
    const allDepartments = [...generalWithUsers, ...childrenWithUsers].map(d => d?.USERS?.map(u => {

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
}
