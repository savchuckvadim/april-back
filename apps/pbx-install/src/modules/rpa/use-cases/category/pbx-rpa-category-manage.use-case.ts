import { Injectable, Logger } from '@nestjs/common';
import { BitrixService, IBxRpaStage } from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx';
import {
    BtxCategoryRepository,
    BtxStageRepository,
    PortalStageEntity,
} from '@lib/portal-lib/pbx-domain';
import { PortalRpaService } from '@lib/portal-lib/pbx-domain/portal-rpa';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { bigintConvertToNumber } from '@/shared';
import { MANAGE_DOMAIN_ALL } from '@app/pbx-install/shared';
import {
    DeleteRpaCategoryStageDto,
    EditRpaCategoryStageDto,
} from '../../dto/manage-rpa-category.dto';

export interface PerPortalRpaStageOperationResult {
    domain: string;
    portalId: number;
    bx: { bxId: string | number | null; ok: boolean; error?: string };
    db: { ok: boolean; stageId?: number; error?: string };
}

interface RpaManageCtx {
    portalId: number;
    rpaTypeId: number;
    rpaDbId: number;
    bitrix: BitrixService;
}

/**
 * Manage-операции над стадиями воронки RPA (`rpa.stage.*` + зеркало `btx_stages`).
 * У RPA одна категория, поэтому стадия адресуется только `stageCode`.
 * `domain === 'all'` повторяет операцию по всем порталам с этим RPA.
 */
@Injectable()
export class PbxRpaCategoryManageUseCase {
    private readonly logger = new Logger(PbxRpaCategoryManageUseCase.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly portalRpaService: PortalRpaService,
        private readonly categoryRepository: BtxCategoryRepository,
        private readonly stageRepository: BtxStageRepository,
    ) {}

    async deleteCategoryStage(
        dto: DeleteRpaCategoryStageDto,
    ): Promise<PerPortalRpaStageOperationResult[]> {
        const domains = await this.resolveDomains(dto.domain);
        const out: PerPortalRpaStageOperationResult[] = [];
        for (const domain of domains) {
            const ctx = await this.resolveCtx(domain, dto.rpaName);
            if (!ctx) continue;
            const stage = await this.findStage(ctx.rpaDbId, dto.stageCode);
            if (!stage) {
                out.push(notFound(domain, ctx.portalId, 'stage not found'));
                continue;
            }
            const bx = await this.deleteBxStage(ctx, stage);
            const db = await this.safe(
                () => this.stageRepository.delete(stage.id),
                stage.id,
            );
            out.push({ domain, portalId: ctx.portalId, bx, db });
        }
        return out;
    }

    async editCategoryStage(
        dto: EditRpaCategoryStageDto,
    ): Promise<PerPortalRpaStageOperationResult[]> {
        const domains = await this.resolveDomains(dto.domain);
        const out: PerPortalRpaStageOperationResult[] = [];
        for (const domain of domains) {
            const ctx = await this.resolveCtx(domain, dto.rpaName);
            if (!ctx) continue;
            const stage = await this.findStage(ctx.rpaDbId, dto.stageCode);
            if (!stage) {
                out.push(notFound(domain, ctx.portalId, 'stage not found'));
                continue;
            }
            const bx = await this.updateBxStage(ctx, stage, dto.newValue);
            const db = await this.safe(
                () =>
                    this.stageRepository.update(stage.id, {
                        name: dto.newValue,
                        title: dto.newValue,
                    }),
                stage.id,
            );
            out.push({ domain, portalId: ctx.portalId, bx, db });
        }
        return out;
    }

    private async resolveDomains(domain: string): Promise<string[]> {
        if (domain !== MANAGE_DOMAIN_ALL) return [domain];
        const portals = await this.portalService.getPortals();
        if (!portals) return [];
        return portals
            .map(p => p.domain)
            .filter((d): d is string => typeof d === 'string' && d.length > 0);
    }

    private async resolveCtx(
        domain: string,
        rpaName: string,
    ): Promise<RpaManageCtx | null> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            this.logger.warn(`portal not found for ${domain}`);
            return null;
        }
        const rpa = await this.portalRpaService.findFirstByPortalAndCode(
            BigInt(portal.id),
            rpaName,
        );
        if (!rpa) {
            this.logger.warn(`rpa not found for ${domain}/${rpaName}`);
            return null;
        }
        const { bitrix } = await this.pbxService.init(domain);
        return {
            portalId: Number(portal.id),
            rpaTypeId: Number(rpa.typeId),
            rpaDbId: bigintConvertToNumber(rpa.id),
            bitrix,
        };
    }

    private async findStage(
        rpaDbId: number,
        stageCode: string,
    ): Promise<PortalStageEntity | null> {
        const categories = await this.categoryRepository.findByEntity(
            PbxEntityTypePrisma.BTX_RPA,
            rpaDbId,
        );
        for (const category of categories ?? []) {
            const stage = (category.stages ?? []).find(
                s => s.code === stageCode,
            );
            if (stage) return stage;
        }
        return null;
    }

    private async findBxStageId(
        ctx: RpaManageCtx,
        stage: PortalStageEntity,
    ): Promise<string | number | null> {
        const res = (await ctx.bitrix.rpaStage.listForType(ctx.rpaTypeId)) as
            | { result?: { stages?: IBxRpaStage[] } }
            | undefined;
        const stages = res?.result?.stages ?? [];
        const match = stages.find(
            s => (s.code && s.code === stage.code) || s.name === stage.name,
        );
        return match?.id ?? (stage.bitrixId ? stage.bitrixId : null);
    }

    private async deleteBxStage(
        ctx: RpaManageCtx,
        stage: PortalStageEntity,
    ): Promise<PerPortalRpaStageOperationResult['bx']> {
        const bxId = await this.findBxStageId(ctx, stage);
        if (bxId == null) {
            return { bxId: null, ok: false, error: 'bitrix stage not found' };
        }
        try {
            await ctx.bitrix.rpaStage.delete(bxId);
            return { bxId, ok: true };
        } catch (e) {
            return { bxId, ok: false, error: (e as Error).message };
        }
    }

    private async updateBxStage(
        ctx: RpaManageCtx,
        stage: PortalStageEntity,
        newValue: string,
    ): Promise<PerPortalRpaStageOperationResult['bx']> {
        const bxId = await this.findBxStageId(ctx, stage);
        if (bxId == null) {
            return { bxId: null, ok: false, error: 'bitrix stage not found' };
        }
        try {
            await ctx.bitrix.rpaStage.update(bxId, { name: newValue });
            return { bxId, ok: true };
        } catch (e) {
            return { bxId, ok: false, error: (e as Error).message };
        }
    }

    private async safe(
        op: () => Promise<unknown>,
        stageId: number,
    ): Promise<PerPortalRpaStageOperationResult['db']> {
        try {
            await op();
            return { ok: true, stageId };
        } catch (e) {
            return { ok: false, stageId, error: (e as Error).message };
        }
    }
}

function notFound(
    domain: string,
    portalId: number,
    error: string,
): PerPortalRpaStageOperationResult {
    return {
        domain,
        portalId,
        bx: { bxId: null, ok: false, error },
        db: { ok: false, error },
    };
}
