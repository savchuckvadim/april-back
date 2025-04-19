import { Injectable, Logger } from "@nestjs/common";
import dayjs from "dayjs";
import Redis from "ioredis";
import { RedisService } from "src/core/redis/redis.service";
import { DepartmentBitrixService } from "src/modules/bitrix/domain/department/services/department-bitrxi.service";
import { IBXUser } from "src/modules/bitrix/domain/interfaces/bitrix.interface";
import { EDepartamentGroup, IPortal } from "src/modules/portal/interfaces/portal.interface";
import { PortalService } from "src/modules/portal/portal.service";
import { PortalModel } from "src/modules/portal/services/portal.model";


@Injectable()
export class DepartmentResolverService {
  private readonly redis: Redis;
  constructor(
    private readonly portalService: PortalService,
    private readonly bitrixService: DepartmentBitrixService,
    private readonly redisService: RedisService,
    private readonly portalModel: PortalModel
  ) {

    this.redis = redisService.getClient()
  }

  async getFullDepartment(domain: string, group: EDepartamentGroup) {
    const day = dayjs().format('MMDD');
    const sessionKey = `department_${domain}_${day}`;
    const fromCache = await this.redis.get(sessionKey);
    // if (fromCache) return JSON.parse(fromCache);

    const portal = await this.portalService.getPortalByDomain(domain);
    const baseDepartmentBitrixId = this.portalModel.getDepartamentIdByPortal(portal, group);

    const general = await this.bitrixService.getDepartments(portal, { ID: baseDepartmentBitrixId });
    const children = await this.bitrixService.getDepartments(portal, { PARENT: baseDepartmentBitrixId });

    const generalWithUsers = await this.bitrixService.enrichWithUsers(portal, general);
    const childrenWithUsers = await this.bitrixService.enrichWithUsers(portal, children);

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
