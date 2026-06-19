import { Injectable, NotFoundException } from '@nestjs/common';
import { portal_measure } from 'generated/prisma';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import {
    PortalMeasureService,
    PortalMeasureSyncResult,
    PortalMeasureSyncService,
} from '@lib/portal-lib/konstructor';

/**
 * Синхронизация портальных единиц измерения по `domain` портала.
 *
 * Резолвит портал по домену (через {@link PortalStoreService}) и делегирует
 * доменную логику в {@link PortalMeasureSyncService}.
 */
@Injectable()
export class SyncPortalMeasuresUseCase {
    constructor(
        private readonly portalService: PortalStoreService,
        private readonly syncService: PortalMeasureSyncService,
        private readonly portalMeasureService: PortalMeasureService,
    ) {}

    async syncByDomain(domain: string): Promise<PortalMeasureSyncResult> {
        const portalId = await this.resolvePortalId(domain);
        return this.syncService.syncFromGlobal(portalId);
    }

    async listByDomain(domain: string): Promise<portal_measure[]> {
        const portalId = await this.resolvePortalId(domain);
        return this.portalMeasureService.findByPortalId(portalId);
    }

    private async resolvePortalId(domain: string): Promise<number> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException(
                `Portal with domain ${domain} not found`,
            );
        }
        return Number(portal.id);
    }
}
