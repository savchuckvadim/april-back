import { Injectable, Logger } from '@nestjs/common';
import { BitrixOwnerTypeId, BitrixService, IBXStatus } from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx';
import {
    BtxCategoryResponseDto,
    BtxCategoryService,
    BtxStageRepository,
    BtxStageResponseDto,
    PortalDealService,
} from '@lib/portal-lib/pbx-domain';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PbxEntityType } from '@/shared/enums';
import {
    MANAGE_DOMAIN_ALL,
    normalizeBitrixStageColor,
    normalizeStatusListResult,
} from '@app/pbx-install/shared';
import { InstallCategorySyncService } from '@app/pbx-install/category/install-category-sync.service';
import { InstallStageSyncService } from '@app/pbx-install/stage/install-stage-sync.service';
import { InstallCategoryParent } from '@app/pbx-install/category';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { DealCategoryStageStrategy } from '../../services/categories/deal-category-stage.strategy';
import {
    DeleteDealCategoriesDto,
    DeleteDealCategoryStageDto,
    EditDealCategoryStageDto,
} from '../../dto/manage-deal-category.dto';

export interface PerPortalCategoryDeleteResult {
    domain: string;
    portalId: number;
    deletedBxCategoryIds: number[];
    deletedDbCategoryIds: number[];
    notFoundCodes: string[];
}

export interface PerPortalStageOperationResult {
    domain: string;
    portalId: number;
    bx: {
        statusId: string | null;
        bxId: string | number | null;
        ok: boolean;
        error?: string;
    };
    db: { ok: boolean; stageId?: number; error?: string };
}

/**
 * Manage-операции над воронками и стадиями сделки Bitrix-портала.
 *
 * 1) `deleteCategories`     — удаляет указанные воронки (по `code`) из PortalDB и Bitrix.
 *    Стадии в Bitrix удаляются перед самой воронкой.
 * 2) `deleteCategoryStage`  — удаляет одну стадию воронки в обоих хранилищах.
 * 3) `editCategoryStage`    — обновляет `NAME`/`name`/`title` одной стадии (code и bitrixId сохраняются).
 *
 * При `domain === 'all'` операция выполняется для всех порталов
 * (сделка-якорь в PortalDB должна существовать).
 *
 * Аналог {@link PbxDealFieldManageUseCase} для филдов, только для категорий/стадий.
 */
@Injectable()
export class PbxDealCategoryManageUseCase {
    private readonly logger = new Logger(PbxDealCategoryManageUseCase.name);
    private readonly entityTypeId = BitrixOwnerTypeId.DEAL;

    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly portalDealService: PortalDealService,
        private readonly categoryService: BtxCategoryService,
        private readonly stageRepository: BtxStageRepository,
        private readonly categorySync: InstallCategorySyncService,
        private readonly stageSync: InstallStageSyncService,
        private readonly strategy: DealCategoryStageStrategy,
    ) {}

    async deleteCategories(
        dto: DeleteDealCategoriesDto,
    ): Promise<PerPortalCategoryDeleteResult[]> {
        const domains = await this.resolveDomains(dto.domain);
        const results: PerPortalCategoryDeleteResult[] = [];

        for (const domain of domains) {
            const portalDeal = await this.resolvePortalDeal(domain);
            if (!portalDeal) continue;
            const { portalId, dealId, bitrix, parent } = portalDeal;

            const dbCategories = await this.categoryService.findByEntity(
                PbxEntityType.DEAL,
                dealId,
            );
            const requested = new Set(dto.codes);
            const targets = dbCategories.filter(c => requested.has(c.code));
            const notFoundCodes = dto.codes.filter(
                c => !dbCategories.some(d => d.code === c),
            );

            const deletedBxCategoryIds: number[] = [];
            const deletedDbCategoryIds: number[] = [];
            const entityTypeIdStr = String(this.entityTypeId);

            for (const cat of targets) {
                const bxCategoryId = Number(cat.bitrixId);
                // Default-воронку (id=0) `crm.category.delete` удалять не умеет — пропускаем.
                if (!Number.isFinite(bxCategoryId) || bxCategoryId <= 0) {
                    this.logger.warn(
                        `skip default/unknown category code=${cat.code} bitrixId=${cat.bitrixId}`,
                    );
                    continue;
                }
                await this.stageSync.deleteAllStagesInCategory({
                    bitrix,
                    entityTypeId: this.entityTypeId,
                    bxCategoryId,
                    strategy: this.strategy,
                });
                await this.categorySync.deleteBitrixCategory(
                    bitrix,
                    bxCategoryId,
                    entityTypeIdStr,
                );
                await this.categorySync.deletePortalCategoryByBitrixId(
                    parent,
                    cat.bitrixId,
                );
                deletedBxCategoryIds.push(bxCategoryId);
                deletedDbCategoryIds.push(cat.id);
            }

            results.push({
                domain,
                portalId,
                deletedBxCategoryIds,
                deletedDbCategoryIds,
                notFoundCodes,
            });
        }
        return results;
    }

    async deleteCategoryStage(
        dto: DeleteDealCategoryStageDto,
    ): Promise<PerPortalStageOperationResult[]> {
        const domains = await this.resolveDomains(dto.domain);
        const results: PerPortalStageOperationResult[] = [];

        for (const domain of domains) {
            const portalDeal = await this.resolvePortalDeal(domain);
            if (!portalDeal) continue;
            const { portalId, dealId, bitrix } = portalDeal;

            const target = await this.findCategoryAndStage(
                dealId,
                dto.categoryCode,
                dto.stageCode,
            );
            if (!target) {
                results.push(
                    notFoundStageResult(
                        domain,
                        portalId,
                        'category or stage not found in PortalDB',
                    ),
                );
                continue;
            }
            const { category, stage } = target;
            const bxLookup = await this.findBxStatus(bitrix, category, stage);

            // Bitrix: удаляем по фактическому ID, если нашли.
            let bxResult: PerPortalStageOperationResult['bx'] = {
                statusId: bxLookup.statusId,
                bxId: null,
                ok: false,
                error: 'bitrix status row not found',
            };
            if (bxLookup.row?.ID != null) {
                try {
                    await this.stageSync.deleteStatusForced(
                        bitrix,
                        bxLookup.row.ID,
                    );
                    bxResult = {
                        statusId: bxLookup.statusId,
                        bxId: bxLookup.row.ID,
                        ok: true,
                    };
                } catch (e) {
                    bxResult = {
                        statusId: bxLookup.statusId,
                        bxId: bxLookup.row.ID,
                        ok: false,
                        error: e instanceof Error ? e.message : String(e),
                    };
                }
            }

            // PortalDB.
            let db: PerPortalStageOperationResult['db'];
            try {
                await this.stageRepository.delete(stage.id);
                db = { ok: true, stageId: stage.id };
            } catch (e) {
                db = {
                    ok: false,
                    stageId: stage.id,
                    error: e instanceof Error ? e.message : String(e),
                };
            }

            results.push({ domain, portalId, bx: bxResult, db });
        }
        return results;
    }

    async editCategoryStage(
        dto: EditDealCategoryStageDto,
    ): Promise<PerPortalStageOperationResult[]> {
        const domains = await this.resolveDomains(dto.domain);
        const results: PerPortalStageOperationResult[] = [];

        for (const domain of domains) {
            const portalDeal = await this.resolvePortalDeal(domain);
            if (!portalDeal) continue;
            const { portalId, dealId, bitrix } = portalDeal;

            const target = await this.findCategoryAndStage(
                dealId,
                dto.categoryCode,
                dto.stageCode,
            );
            if (!target) {
                results.push(
                    notFoundStageResult(
                        domain,
                        portalId,
                        'category or stage not found in PortalDB',
                    ),
                );
                continue;
            }
            const { category, stage } = target;
            const bxLookup = await this.findBxStatus(bitrix, category, stage);

            let bxResult: PerPortalStageOperationResult['bx'] = {
                statusId: bxLookup.statusId,
                bxId: null,
                ok: false,
                error: 'bitrix status row not found',
            };
            if (bxLookup.row?.ID != null) {
                try {
                    await bitrix.status.update(bxLookup.row.ID, {
                        NAME: dto.newValue,
                    });
                    bxResult = {
                        statusId: bxLookup.statusId,
                        bxId: bxLookup.row.ID,
                        ok: true,
                    };
                } catch (e) {
                    bxResult = {
                        statusId: bxLookup.statusId,
                        bxId: bxLookup.row.ID,
                        ok: false,
                        error: e instanceof Error ? e.message : String(e),
                    };
                }
            }

            let db: PerPortalStageOperationResult['db'];
            try {
                await this.stageRepository.update(stage.id, {
                    name: dto.newValue,
                    title: dto.newValue,
                    color: normalizeBitrixStageColor(stage.color, this.logger),
                });
                db = { ok: true, stageId: stage.id };
            } catch (e) {
                db = {
                    ok: false,
                    stageId: stage.id,
                    error: e instanceof Error ? e.message : String(e),
                };
            }

            results.push({ domain, portalId, bx: bxResult, db });
        }
        return results;
    }

    private async resolveDomains(domain: string): Promise<string[]> {
        if (domain !== MANAGE_DOMAIN_ALL) {
            return [domain];
        }
        const portals = await this.portalService.getPortals();
        if (!portals) return [];
        return portals
            .map(p => p.domain)
            .filter((d): d is string => typeof d === 'string' && d.length > 0);
    }

    private async resolvePortalDeal(domain: string): Promise<{
        portalId: number;
        dealId: number;
        bitrix: BitrixService;
        parent: InstallCategoryParent;
    } | null> {
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

    private async findCategoryAndStage(
        dealId: number,
        categoryCode: string,
        stageCode: string,
    ): Promise<{
        category: BtxCategoryResponseDto;
        stage: BtxStageResponseDto;
    } | null> {
        const dbCategories = await this.categoryService.findByEntity(
            PbxEntityType.DEAL,
            dealId,
        );
        const category = dbCategories.find(c => c.code === categoryCode);
        if (!category) return null;
        const stage = (category.stages ?? []).find(s => s.code === stageCode);
        if (!stage) return null;
        return { category, stage };
    }

    private async findBxStatus(
        bitrix: BitrixService,
        category: BtxCategoryResponseDto,
        stage: BtxStageResponseDto,
    ): Promise<{ statusId: string; row: IBXStatus | null }> {
        const bxCategoryId = Number(category.bitrixId);
        const entityId = this.strategy.statusEntityId(
            this.entityTypeId,
            bxCategoryId,
        );
        const statusId = this.strategy.statusId(
            this.entityTypeId,
            bxCategoryId,
            stage.bitrixId,
        );
        const list = await bitrix.status.getList({ ENTITY_ID: entityId });
        const rows = normalizeStatusListResult(list.result);
        const row = rows.find(r => r.STATUS_ID === statusId) ?? null;
        return { statusId, row };
    }
}

function notFoundStageResult(
    domain: string,
    portalId: number,
    error: string,
): PerPortalStageOperationResult {
    return {
        domain,
        portalId,
        bx: { statusId: null, bxId: null, ok: false, error },
        db: { ok: false, error },
    };
}
