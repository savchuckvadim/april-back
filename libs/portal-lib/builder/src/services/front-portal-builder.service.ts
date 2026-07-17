import { Injectable, NotFoundException } from '@nestjs/common';
import { PortalAggregateRepository } from '../repositories/portal-aggregate.repository';
import { buildPortalParts } from '../mappers/build-portal-parts';
import { firstOrNull, firstSales } from '../mappers/pbx-entity.mapper';
import { toNumber } from '../mappers/laravel-serialize.util';
import { FrontPortalDto } from '../dto/front-portal.dto';

/**
 * Локальная сборка модели портала для фронта — поле в поле повторяет
 * ответ Laravel PortalFrontResource (без ключей доступа).
 */
@Injectable()
export class FrontPortalBuilderService {
    constructor(private readonly repository: PortalAggregateRepository) {}

    async buildByDomain(domain: string): Promise<FrontPortalDto> {
        const aggregate = await this.repository.findByDomain(domain);
        if (!aggregate) {
            throw new NotFoundException('portal does not exist!');
        }

        const parts = buildPortalParts(aggregate);

        return {
            id: toNumber(aggregate.portal.id),
            departament: firstSales(parts.departaments),
            bitrixLists: parts.lists,
            bitrixCallingTasksGroup: firstSales(parts.callingGroups),
            bitrixSmart: firstSales(parts.smarts),
            bitrixDeal: firstOrNull(parts.deals),
            smarts: parts.smarts,
            deals: parts.deals,
            rpas: parts.rpas,
            user: firstOrNull(parts.users),
            company: firstOrNull(parts.companies),
            lead: firstOrNull(parts.leads),
            contact: firstOrNull(parts.contacts),
        };
    }
}
