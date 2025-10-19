import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import Redis from 'ioredis';
import { RedisService } from 'src/core/redis/redis.service';
import { DepartmentBitrixService } from 'src/modules/bitrix/domain/department/services/department-bitrxi.service';
import { IBXUser } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import {
    EDepartamentGroup,
    IPortal,
} from 'src/modules/portal/interfaces/portal.interface';
import { PBXService } from '@/modules/pbx';

// C:\Projects\April-KP\april-next\back\src\modules\bitrix\endpoints\department\services\department-resolver-bitrxi.service.ts
@Injectable()
export class DepartmentResolverService {
    private readonly redis: Redis;

    constructor(
        // private readonly bitrixService: DepartmentBitrixService,
        private readonly redisService: RedisService,
        // private readonly portalContext: PortalContextService,
        private readonly pbx: PBXService,
    ) {
        this.redis = this.redisService.getClient();
    }

    async getFullDepartment(domain: string, group: EDepartamentGroup) {
        const { bitrix, PortalModel } = await this.pbx.init(domain);
        const departmentService = new DepartmentBitrixService(bitrix.api);
        const day = dayjs().format('MMDD');
        const sessionKey = `department_${domain}_${day}`;
        const fromCache = await this.redis.get(sessionKey);
        if (fromCache) return JSON.parse(fromCache);

        const portal = PortalModel
        const baseDepartmentBitrix = portal.getDepartamentIdByCode(group);

        const baseDepartmentBitrixId = baseDepartmentBitrix?.bitrixId;

        const general = await departmentService.getDepartments({
            ID: baseDepartmentBitrixId,
        });
        const children = await departmentService.getDepartments({
            PARENT: baseDepartmentBitrixId,
        });

        const generalWithUsers =
            await departmentService.enrichWithUsers(general);
        const childrenWithUsers =
            await departmentService.enrichWithUsers(children);

        const allUsers: IBXUser[] = [];
        const allDepartments = [...generalWithUsers, ...childrenWithUsers].map(
            d =>
                d?.USERS?.map(u => {
                    if (u) {
                        allUsers.push(u);
                    }
                }),
        );

        const result = {
            department: {
                department: baseDepartmentBitrixId,
                generalDepartment: generalWithUsers,
                childrenDepartments: childrenWithUsers,
                allUsers,
            },
        };

        await this.redis.set(sessionKey, JSON.stringify(result));
        return result;
    }
}
