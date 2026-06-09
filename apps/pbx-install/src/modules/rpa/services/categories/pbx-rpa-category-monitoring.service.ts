import { Injectable, NotFoundException } from '@nestjs/common';
import { IBxRpaStage } from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx';
import {
    BtxCategoryRepository,
    PortalCategoryEntity,
    PortalStageEntity,
} from '@lib/portal-lib/pbx-domain';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PortalRpaService } from '@lib/portal-lib/pbx-domain/portal-rpa';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { RpaNameEnum } from '../../dto/install-rpa.dto';

/** Стадия RPA в monitoring-выдаче: портал ↔ Bitrix. */
export interface PbxRpaMergedStage {
    code: string;
    p: PortalStageEntity | null;
    bx: IBxRpaStage | null;
}

export interface PbxRpaCategoryMonitoringResult {
    portalCategory: PortalCategoryEntity | null;
    mergedStages: PbxRpaMergedStage[];
    portalStagesWithoutMerged: PortalStageEntity[];
    bitrixStagesWithoutMerged: IBxRpaStage[];
}

/**
 * Сводка единственной воронки RPA: PortalDB (`btx_categories`/`btx_stages`) против Bitrix
 * (`rpa.stage.listForType`). Сопоставление стадий — по `code`, fallback по `name`.
 */
@Injectable()
export class PbxRpaCategoryMonitoringService {
    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly portalRpaService: PortalRpaService,
        private readonly categoryRepository: BtxCategoryRepository,
    ) {}

    async getPbxRpaCategoryByDomain(
        domain: string,
        rpaName: RpaNameEnum,
    ): Promise<PbxRpaCategoryMonitoringResult> {
        const { bitrix } = await this.pbxService.init(domain);
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const rpa = await this.portalRpaService.findFirstByPortalAndCode(
            BigInt(portal.id),
            rpaName,
        );
        if (!rpa || !rpa.typeId) {
            throw new NotFoundException(`RPA not installed for ${rpaName}`);
        }

        const categories = await this.categoryRepository.findByEntity(
            PbxEntityTypePrisma.BTX_RPA,
            Number(rpa.id),
        );
        const portalCategory = categories?.[0] ?? null;
        const portalStages = portalCategory?.stages ?? [];

        const res = (await bitrix.rpaStage.listForType(Number(rpa.typeId))) as
            | { result?: { stages?: IBxRpaStage[] } }
            | undefined;
        const bitrixStages = res?.result?.stages ?? [];

        const merged: PbxRpaMergedStage[] = [];
        const usedBxIds = new Set<string>();
        for (const ps of portalStages) {
            const bx =
                bitrixStages.find(
                    b => (b.code && b.code === ps.code) || b.name === ps.name,
                ) ?? null;
            if (bx?.id != null) usedBxIds.add(String(bx.id));
            merged.push({ code: ps.code, p: ps, bx });
        }
        for (const bx of bitrixStages) {
            if (bx.id != null && usedBxIds.has(String(bx.id))) continue;
            merged.push({ code: bx.code ?? '', p: null, bx });
        }

        const portalStagesWithoutMerged = portalStages.filter(
            ps => !merged.some(m => m.p?.id === ps.id),
        );
        const bitrixStagesWithoutMerged = bitrixStages.filter(
            bx => !merged.some(m => m.bx?.id === bx.id),
        );

        return {
            portalCategory,
            mergedStages: merged,
            portalStagesWithoutMerged,
            bitrixStagesWithoutMerged,
        };
    }
}
