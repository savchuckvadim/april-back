import { Injectable, NotFoundException } from '@nestjs/common';
import { IPortal } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { PortalKeysService } from '@lib/portal-lib/store/keys/portal-keys.service';
import { PortalAggregateRepository } from '../repositories/portal-aggregate.repository';
import { PortalAggregate } from '../repositories/portal-aggregate.types';
import { buildPortalParts } from '../mappers/build-portal-parts';
import { firstOrNull, firstSales } from '../mappers/pbx-entity.mapper';
import { mapPortalMeasure, mapPresetRq } from '../mappers/portal-parts.mapper';
import { toNumber } from '../mappers/laravel-serialize.util';

/**
 * Локальная сборка backend-модели IPortal — задел для отказа от HTTP-запроса
 * к внешнему Laravel (PortalService.getPortalByDomain). Существующий
 * HTTP-путь не трогает, потребители переключаются отдельно.
 *
 * Ключи:
 * - `key` — расшифрованный nestKey (новый ключ nest в таблице portals);
 * - `apiKey` и `C_REST_*` — legacy-колонки, зашифрованы Laravel Crypt
 *   (APP_KEY Laravel), nest их расшифровать не может — отдаём как хранятся.
 *   PBXService реально использует только `domain` + `key`.
 */
@Injectable()
export class BackendPortalBuilderService {
    constructor(
        private readonly repository: PortalAggregateRepository,
        private readonly portalKeys: PortalKeysService,
    ) {}

    async buildByDomain(domain: string): Promise<IPortal> {
        return this.build(await this.repository.findByDomain(domain));
    }

    async buildById(id: number): Promise<IPortal> {
        return this.build(await this.repository.findById(id));
    }

    private async build(aggregate: PortalAggregate | null): Promise<IPortal> {
        if (!aggregate) {
            throw new NotFoundException('portal does not exist!');
        }

        const { portal } = aggregate;
        const id = toNumber(portal.id);
        const key = (await this.portalKeys.get(id, 'nestKey')) ?? '';
        const parts = buildPortalParts(aggregate);

        return {
            id,
            domain: portal.domain ?? '',
            key,
            apiKey: '',
            C_REST_WEB_HOOK_URL: portal.C_REST_WEB_HOOK_URL ?? '',
            C_REST_CLIENT_SECRET: portal.C_REST_CLIENT_SECRET ?? '',
            C_REST_CLIENT_ID: portal.C_REST_CLIENT_ID ?? '',
            createdAt: portal.created_at ?? undefined,
            updatedAt: portal.updated_at ?? undefined,
            lists: parts.lists,
            bitrixLists: parts.lists,
            departament: firstSales(parts.departaments) ?? undefined,
            departaments: parts.departaments,
            smarts: parts.smarts,
            deals: parts.deals,
            rpas: parts.rpas,
            company: firstOrNull(parts.companies) ?? undefined,
            contact: firstOrNull(parts.contacts) ?? undefined,
            lead: firstOrNull(parts.leads) ?? undefined,
            bx_rq: portal.bxRqs.map(mapPresetRq),
            measures: portal.portal_measure.map(mapPortalMeasure),
            bitrixCallingTasksGroup:
                firstSales(parts.callingGroups) ?? undefined,
            callingGroups: parts.callingGroups,
        };
    }
}
