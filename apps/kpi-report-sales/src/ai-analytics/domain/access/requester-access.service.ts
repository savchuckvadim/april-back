import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { BxDepartmentStructureService } from '@lib/bx-department';
import { EBxVisibilityLevel } from '@lib/bx-department/dto/bx-department-structure.dto';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import { buildAccessKey } from '../../cache/cache-key.util';
import {
    AI_ANALYTICS_ACCESS_TTL_SECONDS,
    AI_ANALYTICS_LEADER_ROLES,
    AiAnalyticsRequesterRole,
} from '../../constants/ai-analytics.const';
import { isManagerVisible, RequesterAccess } from './perimeter.util';

export type { RequesterAccess } from './perimeter.util';

/** Уровень видимости структуры → роль витрины. */
const ROLE_BY_VISIBILITY: Record<EBxVisibilityLevel, AiAnalyticsRequesterRole> =
    {
        [EBxVisibilityLevel.all]: 'cup',
        [EBxVisibilityLevel.department]: 'op',
        [EBxVisibilityLevel.group]: 'group',
        [EBxVisibilityLevel.own]: 'manager',
    };

/**
 * Права ai-analytics по структуре отделов продаж (libs/bx-department):
 * уровень видимости currentUser.visibility (учитывает и HEADS структуры,
 * и поднятие уровня настройками портала) даёт роль и периметр —
 * all → все менеджеры, department → ОП, group → группа, own → только себя.
 *
 * Результат кэшируется на 5 минут в AppCache. Ошибка структуры —
 * fail-closed: requester считается менеджером и видит только себя.
 */
@Injectable()
export class RequesterAccessService {
    private readonly logger = new Logger(RequesterAccessService.name);

    constructor(
        private readonly structure: BxDepartmentStructureService,
        private readonly cache: AiAnalyticsCacheService,
    ) {}

    async resolve(
        domain: string,
        requesterUserId: string,
    ): Promise<RequesterAccess> {
        const { value } = await this.cache.remember<RequesterAccess>(
            buildAccessKey(domain, requesterUserId),
            AI_ANALYTICS_ACCESS_TTL_SECONDS,
            () => this.resolveFromStructure(domain, requesterUserId),
        );
        return value;
    }

    /** Руководитель ли requester (по умолчанию cup|op|group), иначе 403. */
    assertLeader(
        access: RequesterAccess,
        allowed: readonly AiAnalyticsRequesterRole[] = AI_ANALYTICS_LEADER_ROLES,
    ): void {
        if (!allowed.includes(access.role)) {
            throw new ForbiddenException(
                'Операция доступна только руководителю отдела продаж',
            );
        }
    }

    /** Менеджер в периметре, иначе 403 (запись реакции за чужого и т.п.). */
    assertVisible(access: RequesterAccess, managerId: string | null): void {
        if (!isManagerVisible(access, managerId)) {
            throw new ForbiddenException(
                'Менеджер вне периметра видимости пользователя',
            );
        }
    }

    private async resolveFromStructure(
        domain: string,
        requesterUserId: string,
    ): Promise<RequesterAccess> {
        const self = String(Number(requesterUserId));
        try {
            const { currentUser } = await this.structure.getStructure(
                domain,
                EDepartamentGroup.sales,
                Number(requesterUserId),
            );
            const role =
                ROLE_BY_VISIBILITY[currentUser.visibility] ?? 'manager';
            if (currentUser.visibility === EBxVisibilityLevel.all) {
                return { role, visibleManagerIds: null };
            }
            const colleagues =
                currentUser.visibility === EBxVisibilityLevel.department
                    ? currentUser.colleagues.department
                    : currentUser.visibility === EBxVisibilityLevel.group
                      ? currentUser.colleagues.group
                      : [];
            const ids = new Set<string>([
                self,
                ...colleagues.map(user => String(Number(user.ID))),
            ]);
            return { role, visibleManagerIds: [...ids].sort() };
        } catch (error) {
            this.logger.warn(
                `Структура ${domain} для пользователя ${requesterUserId} не прочитана, доступ только к своим данным: ${(error as Error).message}`,
            );
            return { role: 'manager', visibleManagerIds: [self] };
        }
    }
}
