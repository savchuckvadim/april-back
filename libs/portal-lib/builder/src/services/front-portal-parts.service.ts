import { Injectable, NotFoundException } from '@nestjs/common';
import { FrontPortalPartsDto } from '../dto/front-portal-parts.dto';
import { buildPortalParts } from '../mappers/build-portal-parts';
import { toNumber } from '../mappers/laravel-serialize.util';
import { firstOrNull, firstSales } from '../mappers/pbx-entity.mapper';
import { PortalPartName, portalScopeOf } from '../mappers/portal-scope.util';
import { PortalAggregateRepository } from '../repositories/portal-aggregate.repository';

/**
 * Части портала по запросу — узкая ручка рядом с полной моделью
 * (FrontPortalBuilderService её не заменяет: полной пользуются все
 * приложения). Полная модель весит около мегабайта, а экрану обычно нужны
 * две-три части: здесь из БД читаются только их сущности, поля и воронки.
 * Мапперы те же, что у полной модели, поэтому форма каждой части совпадает.
 */
@Injectable()
export class FrontPortalPartsService {
    constructor(private readonly repository: PortalAggregateRepository) {}

    async buildByDomain(
        domain: string,
        parts: readonly PortalPartName[],
        smartTypes?: readonly string[],
    ): Promise<FrontPortalPartsDto> {
        const wanted = new Set(parts);
        const aggregate = await this.repository.findScopedByDomain(
            domain,
            portalScopeOf(wanted, smartTypes),
        );
        if (!aggregate) {
            throw new NotFoundException('portal does not exist!');
        }

        const built = buildPortalParts(aggregate);
        const result: FrontPortalPartsDto = {
            id: toNumber(aggregate.portal.id),
        };
        if (wanted.has('bitrixDeal')) {
            result.bitrixDeal = firstOrNull(built.deals);
        }
        if (wanted.has('company')) {
            result.company = firstOrNull(built.companies);
        }
        if (wanted.has('contact')) {
            result.contact = firstOrNull(built.contacts);
        }
        if (wanted.has('lead')) result.lead = firstOrNull(built.leads);
        if (wanted.has('rpas')) result.rpas = built.rpas;
        if (wanted.has('smarts')) result.smarts = built.smarts;
        if (wanted.has('bitrixLists')) result.bitrixLists = built.lists;
        if (wanted.has('user')) result.user = firstOrNull(built.users);
        if (wanted.has('departament')) {
            result.departament = firstSales(built.departaments);
        }
        if (wanted.has('bitrixCallingTasksGroup')) {
            result.bitrixCallingTasksGroup = firstSales(built.callingGroups);
        }
        return result;
    }
}
