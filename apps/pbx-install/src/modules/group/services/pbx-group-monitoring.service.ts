import { Injectable, NotFoundException } from '@nestjs/common';

import { IBXSonetGroup } from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx';
import {
    PortalCallingResponseDto,
    PortalCallingService,
} from '@lib/portal-lib/pbx-domain/portal-calling';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';

export interface PbxGroupMergedItem {
    bitrixId: number;
    p: PortalCallingResponseDto | null;
    bx: IBXSonetGroup | null;
}

export interface PbxGroupMonitoringResult {
    merged: PbxGroupMergedItem[];
    portalWithoutMerged: PortalCallingResponseDto[];
    bitrixWithoutMerged: IBXSonetGroup[];
}

/**
 * Мониторинг групп звонков: смерженное состояние Bitrix (`sonet_group`) и
 * PortalDB (`callings`) по bitrixId.
 */
@Injectable()
export class PbxGroupMonitoringService {
    constructor(
        private readonly pbxService: PBXService,
        private readonly portalCallingService: PortalCallingService,
        private readonly portalService: PortalStoreService,
    ) {}

    async getPbxGroupData(domain: string): Promise<PbxGroupMonitoringResult> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const portalId = Number(portal.id);

        const { bitrix } = await this.pbxService.init(domain);

        const portalGroups =
            await this.portalCallingService.findByPortalId(portalId);
        const bitrixGroupsResponse = await bitrix.sonetGroup.get();
        const bitrixGroups = bitrixGroupsResponse.result ?? [];

        const merged: PbxGroupMergedItem[] = [];
        for (const p of portalGroups) {
            const bx =
                bitrixGroups.find(g => Number(g.ID) === p.bitrixId) ?? null;
            if (bx) {
                merged.push({ bitrixId: p.bitrixId, p, bx });
            }
        }

        const portalWithoutMerged = portalGroups.filter(
            p => !merged.some(m => m.p?.id === p.id),
        );
        const bitrixWithoutMerged = bitrixGroups.filter(
            g => !merged.some(m => m.bx?.ID === g.ID),
        );

        return {
            merged,
            portalWithoutMerged,
            bitrixWithoutMerged,
        };
    }
}
