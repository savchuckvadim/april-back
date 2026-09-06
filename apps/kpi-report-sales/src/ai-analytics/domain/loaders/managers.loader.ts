import { Injectable, Logger } from '@nestjs/common';
import { BxDepartmentStructureService } from '@lib/bx-department';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import {
    AI_ANALYTICS_MANAGERS_TTL_SECONDS,
    buildManagersKey,
} from './loader-cache-key.util';

/**
 * Пользователь-«зонд» для чтения структуры без привязки к requester'у:
 * getStructure строит currentUser по userId, но ростер (salesDepartments[]
 * .allUsers) от него не зависит; неизвестный id роли не даёт и не роняет.
 */
const ROSTER_PROBE_USER_ID = 0;

/** Числовые id менеджеров: мусор отброшен, дедуп, сортировка по возрастанию. */
export function normalizeManagerIds(
    ids: readonly (string | number | null | undefined)[],
): number[] {
    return [
        ...new Set(
            ids
                .map(id => Number(String(id ?? '').trim()))
                .filter(id => Number.isFinite(id) && id > 0),
        ),
    ].sort((a, b) => a - b);
}

/**
 * Ростер менеджеров для loader'ов KPI-слоя: явный список managerIds
 * нормализуется, без него берутся все сотрудники отделов продаж по
 * структуре libs/bx-department (кэш 5 минут в AppCache). Периметр
 * requester'а к ростеру не применяется — это делает presenter.
 */
@Injectable()
export class ManagersLoader {
    private readonly logger = new Logger(ManagersLoader.name);

    constructor(
        private readonly structure: BxDepartmentStructureService,
        private readonly cache: AiAnalyticsCacheService,
    ) {}

    async resolve(
        domain: string,
        managerIds?: readonly (string | number)[],
    ): Promise<number[]> {
        const explicit = normalizeManagerIds(managerIds ?? []);
        if (explicit.length) return explicit;

        const { value } = await this.cache.remember<number[]>(
            buildManagersKey(domain),
            AI_ANALYTICS_MANAGERS_TTL_SECONDS,
            () => this.loadRoster(domain),
        );
        return value;
    }

    private async loadRoster(domain: string): Promise<number[]> {
        const { salesDepartments } = await this.structure.getStructure(
            domain,
            EDepartamentGroup.sales,
            ROSTER_PROBE_USER_ID,
        );
        const ids = normalizeManagerIds(
            (salesDepartments ?? []).flatMap(sales =>
                (sales.allUsers ?? []).map(user => user.ID),
            ),
        );
        if (!ids.length) {
            this.logger.warn(
                `Ростер ОП пуст (${domain}): структура без сотрудников`,
            );
        }
        return ids;
    }
}
