import { Injectable, Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx';
import {
    BtxCategoryResponseDto,
    BtxCategoryService,
    PortalDealService,
} from '@lib/portal-lib/pbx-domain';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PbxEntityType, PbxEntityTypePrisma } from '@/shared/enums';
import { MANAGE_DOMAIN_ALL } from '@app/pbx-install/shared';
import { InstallCategoryParent } from '@app/pbx-install/category';

/** Портал + сделка-якорь + инстанс Bitrix одного домена. */
export interface ResolvedPortalDeal {
    portalId: number;
    dealId: number;
    bitrix: BitrixService;
    parent: InstallCategoryParent;
}

/**
 * Резолвинг «домен → портал → сделка-якорь → воронка» для операций над
 * воронками и стадиями сделки.
 *
 * Вынесено из use-case-ов: и manage-операции, и поштучная синхронизация
 * стадии начинаются с одних и тех же трёх шагов, а дублировать их —
 * гарантированный рассинхрон (CLAUDE.md: DRY, одна ответственность).
 *
 * Инстанс Bitrix берётся ТОЛЬКО через `PBXService.init(domain)` на каждый
 * домен: держать его в поле сервиса нельзя (race condition между порталами).
 */
@Injectable()
export class PbxDealPortalResolverService {
    private readonly logger = new Logger(PbxDealPortalResolverService.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly portalDealService: PortalDealService,
        private readonly categoryService: BtxCategoryService,
    ) {}

    /**
     * Список доменов операции: конкретный домен либо все порталы при
     * `domain === 'all'`.
     */
    async resolveDomains(domain: string): Promise<string[]> {
        if (domain !== MANAGE_DOMAIN_ALL) {
            return [domain];
        }
        const portals = await this.portalService.getPortals();
        if (!portals) return [];
        return portals
            .map(p => p.domain)
            .filter((d): d is string => typeof d === 'string' && d.length > 0);
    }

    /**
     * Портал, сделка-якорь и инстанс Bitrix домена.
     * `null` — портала или сделки в PortalDB нет: домен молча пропускается
     * (при `domain: 'all'` один неподготовленный портал не должен рушить
     * операцию по остальным).
     */
    async resolvePortalDeal(
        domain: string,
    ): Promise<ResolvedPortalDeal | null> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            this.logger.warn(`portal not found for domain ${domain}`);
            return null;
        }
        const portalId = Number(portal.id);
        const deal = await this.portalDealService.findByPortalId(portalId);
        if (!deal) {
            this.logger.warn(`deal not found for portalId ${portalId}`);
            return null;
        }
        const { bitrix } = await this.pbxService.init(domain);
        const parent: InstallCategoryParent = {
            entityType: PbxEntityTypePrisma.DEAL,
            entityDbId: BigInt(Number(deal.id)),
            parentType: 'deal',
        };
        return { portalId, dealId: Number(deal.id), bitrix, parent };
    }

    /** Воронка сделки по её `code` в PortalDB; `null` — не найдена. */
    async findCategoryByCode(
        dealId: number,
        categoryCode: string,
    ): Promise<BtxCategoryResponseDto | null> {
        const categories = await this.categoryService.findByEntity(
            PbxEntityType.DEAL,
            dealId,
        );
        return categories.find(c => c.code === categoryCode) ?? null;
    }
}
