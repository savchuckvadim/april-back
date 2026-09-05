import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import Redis from 'ioredis';
import { RedisService } from 'src/core/redis/redis.service';
import {
    IBXDepartment,
    IBXUser,
} from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { DepartmentBitrixService } from '@/modules/bitrix/domain/department/services/department-bitrxi.service';
import { PBXService } from '@/modules/pbx';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { BxDepartmentResponseDto } from '../dto/bx-department.dto';
import { withHeads } from '../lib/department-heads.util';
import { BxDepartmentHeadsService } from './bx-department-heads.service';

const CACHE_TTL_SECONDS = 86400;

/**
 * Версия формы ответа в ключе кэша: новые поля не должны ждать полуночи,
 * пока протухнет вчерашний JSON. v2 — parentDepartments и нормализованный
 * UF_HEAD; v3 — список HEADS (структура v3 + UF_HEAD).
 * Менять синхронно с BxDepartmentCacheService.
 */
const CACHE_SHAPE_VERSION = 'v3';

/** Предохранитель климба вверх по PARENT: выше трёх уровней не поднимаемся. */
const PARENT_CLIMB_LIMIT = 3;

@Injectable()
export class BxDepartmentService {
    private readonly logger = new Logger(BxDepartmentService.name);
    private readonly redis: Redis;

    constructor(
        private readonly redisService: RedisService,
        // private readonly portalContext: PortalContextService
        private readonly pbx: PBXService,
        private readonly heads: BxDepartmentHeadsService,
    ) {
        this.redis = this.redisService.getClient();
    }

    async getFullDepartment(
        domain: string,
        group: EDepartamentGroup | undefined,
        resetCache = false,
    ): Promise<BxDepartmentResponseDto> {
        const { bitrix, PortalModel } = await this.pbx.init(domain);

        const targetGroup = this.getTargetGroup(group);
        const baseDepartmentBitrixId = this.getBaseDepartmentIdByGroup(
            targetGroup,
            PortalModel,
        );
        const day = dayjs().format('MMDD');
        const sessionKey = `department_${domain}_${day}_${targetGroup}_${CACHE_SHAPE_VERSION}`;

        if (!resetCache) {
            const fromCache = await this.redis.get(sessionKey);
            if (fromCache) {
                return JSON.parse(fromCache) as BxDepartmentResponseDto;
            }
        }

        const departmentService = new DepartmentBitrixService(bitrix);

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
        const parentsWithUsers = await this.fetchParentDepartments(
            departmentService,
            generalWithUsers,
        );

        // Руководители: структура v3 (руководитель + заместители) ∪ легаси
        // UF_HEAD — одним проходом по всем отделам ответа.
        const v3Heads = await this.heads.resolve(domain, [
            ...generalWithUsers,
            ...childrenWithUsers,
            ...parentsWithUsers,
        ]);
        const generalDepartment = withHeads(generalWithUsers, v3Heads);
        const childrenDepartments = withHeads(childrenWithUsers, v3Heads);
        const parentDepartments = withHeads(parentsWithUsers, v3Heads);

        const allUsers: IBXUser[] = [];
        const allDepartments = [...generalDepartment, ...childrenDepartments];
        allDepartments.map(d =>
            d?.USERS?.map(u => {
                if (u) {
                    allUsers.push(u);
                }
            }),
        );

        const result = {
            department: {
                department: baseDepartmentBitrixId,
                generalDepartment,
                childrenDepartments,
                parentDepartments,
                allUsers,
            },
        } as BxDepartmentResponseDto;

        await this.redis.set(
            sessionKey,
            JSON.stringify(result),
            'EX',
            CACHE_TTL_SECONDS,
        );
        return result;
    }

    /**
     * Родители базового отдела: климб по `PARENT` до {@link PARENT_CLIMB_LIMIT}
     * уровней (порт паттерна `fetchDepartmentTree` из pbx-duplicate
     * responsible.service). Нужны для честного «вышестоящего»: руководитель
     * базового отдела сам сидит в родительском. Руководители сюда ещё не
     * подмешаны — это делает withHeads в getFullDepartment.
     */
    private async fetchParentDepartments(
        departmentService: DepartmentBitrixService,
        baseDepartments: IBXDepartment[],
    ): Promise<IBXDepartment[]> {
        const parents: IBXDepartment[] = [];
        const seen = new Set<number>(
            baseDepartments.map(dep => Number(dep.ID)),
        );
        let parentId = Number(baseDepartments[0]?.PARENT ?? 0);

        try {
            for (
                let level = 0;
                level < PARENT_CLIMB_LIMIT && parentId > 0;
                level++
            ) {
                if (seen.has(parentId)) break;
                seen.add(parentId);

                const found = await departmentService.getDepartments({
                    ID: parentId,
                });
                const parent = found[0];
                if (!parent) break;

                const [enriched] = await departmentService.enrichWithUsers([
                    parent,
                ]);
                if (enriched) parents.push(enriched);
                parentId = Number(parent.PARENT ?? 0);
            }
        } catch (error) {
            // Родители — обогащение для ролей, не повод ронять весь отдел.
            this.logger.warn(
                `parent departments climb failed: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
        return parents;
    }

    private getBaseDepartmentIdByGroup(
        group: EDepartamentGroup | undefined,
        portal: PortalModel,
    ) {
        const targetGroup = this.getTargetGroup(group);
        if (targetGroup === EDepartamentGroup.sales) {
            const baseDepartmentBitrix =
                portal.getDepartamentIdByCode(targetGroup);
            return baseDepartmentBitrix?.bitrixId;
        } else {
            return 9;
        }
    }

    private getTargetGroup(group: EDepartamentGroup | undefined) {
        const targetGroup = group || EDepartamentGroup.sales;
        return targetGroup;
    }
}
