import { Injectable, Logger } from '@nestjs/common';
import { BxDepartmentStructureService } from '@lib/bx-department';
import { BxSalesDepartmentDto } from '@lib/bx-department/dto/bx-department-structure.dto';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import { buildManagersOrgKey } from '../../cache/cache-key.util';
import { AI_ANALYTICS_MANAGERS_TTL_SECONDS } from './loader-cache-key.util';
import { normalizeManagerIds } from './managers.loader';

/** Отдел продаж и группа менеджера по структуре. */
export interface ManagerOrg {
    departmentId: number | null;
    groupId: number | null;
}

/** Плоская запись для кэша (Map в JSON не сериализуется). */
interface ManagerOrgRow extends ManagerOrg {
    managerId: number;
}

const ROSTER_PROBE_USER_ID = 0;

/** Чистая раскладка структуры: менеджер → отдел продаж и группа. */
export function toManagerOrgRows(
    salesDepartments: readonly BxSalesDepartmentDto[],
): ManagerOrgRow[] {
    const byManager = new Map<number, ManagerOrgRow>();
    for (const sales of salesDepartments) {
        const departmentId = Number(sales.department?.ID) || null;
        for (const managerId of normalizeManagerIds(
            (sales.allUsers ?? []).map(user => user.ID),
        )) {
            byManager.set(managerId, {
                managerId,
                departmentId,
                groupId: null,
            });
        }
        for (const group of sales.groups ?? []) {
            const groupId = Number(group.ID) || null;
            for (const managerId of normalizeManagerIds(
                (group.USERS ?? []).map(user => user.ID),
            )) {
                byManager.set(managerId, { managerId, departmentId, groupId });
            }
        }
    }
    return [...byManager.values()].sort((a, b) => a.managerId - b.managerId);
}

/**
 * Раскладка ростера ОП по отделам и группам (departmentId / groupId строк
 * обзора, группировка departmentTotals). Та же структура, что у
 * ManagersLoader, кэш 5 минут (managers:org). Ошибка структуры —
 * fail-open: пустая раскладка, строки получают null.
 */
@Injectable()
export class ManagerOrgLoader {
    private readonly logger = new Logger(ManagerOrgLoader.name);

    constructor(
        private readonly structure: BxDepartmentStructureService,
        private readonly cache: AiAnalyticsCacheService,
    ) {}

    async load(domain: string): Promise<Map<number, ManagerOrg>> {
        const { value } = await this.cache.remember<ManagerOrgRow[]>(
            buildManagersOrgKey(domain),
            AI_ANALYTICS_MANAGERS_TTL_SECONDS,
            () => this.loadRows(domain),
        );
        return new Map(
            value.map(row => [
                row.managerId,
                { departmentId: row.departmentId, groupId: row.groupId },
            ]),
        );
    }

    private async loadRows(domain: string): Promise<ManagerOrgRow[]> {
        try {
            const { salesDepartments } = await this.structure.getStructure(
                domain,
                EDepartamentGroup.sales,
                ROSTER_PROBE_USER_ID,
            );
            return toManagerOrgRows(salesDepartments ?? []);
        } catch (error) {
            this.logger.warn(
                `Раскладка ОП ${domain} не прочитана, отделы строк будут null: ${(error as Error).message}`,
            );
            return [];
        }
    }
}
