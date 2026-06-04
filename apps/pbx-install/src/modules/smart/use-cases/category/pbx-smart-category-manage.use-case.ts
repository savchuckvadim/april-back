import { Injectable, Logger } from '@nestjs/common';
import { BitrixService, IBXStatus } from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx';
import {
    BtxCategoryResponseDto,
    BtxCategoryService,
    BtxStageRepository,
    BtxStageResponseDto,
} from '@/modules/pbx-domain';
import { PortalSmartService } from '@/modules/pbx-domain/portal-smart';
import { PortalStoreService } from '@lib/portal-konstructor/portal/portal-store.service';
import { PbxEntityType, PbxEntityTypePrisma } from '@/shared/enums';
import {
    MANAGE_DOMAIN_ALL,
    normalizeBitrixStageColor,
    normalizeStatusListResult,
} from '@app/pbx-install/shared';
import { InstallCategorySyncService } from '@app/pbx-install/category/install-category-sync.service';
import { InstallStageSyncService } from '@app/pbx-install/stage/install-stage-sync.service';
import { InstallCategoryParent } from '@app/pbx-install/category';
import { SmartCategoryStageStrategy } from '../../services/smart-categories/smart-category-stage.strategy';
import {
    DeleteSmartCategoriesDto,
    DeleteSmartCategoryStageDto,
    EditSmartCategoryStageDto,
} from '../../dto/manage-smart-category.dto';

export interface PerPortalSmartCategoryDeleteResult {
    domain: string;
    portalId: number;
    deletedBxCategoryIds: number[];
    deletedDbCategoryIds: number[];
    notFoundCodes: string[];
}

export interface PerPortalSmartStageOperationResult {
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
 * Manage-операции над воронками и стадиями смарта Bitrix-портала.
 *
 * 1) `deleteCategories`     — удаляет указанные воронки (по `code`) из PortalDB и Bitrix.
 * 2) `deleteCategoryStage`  — удаляет одну стадию воронки в обоих хранилищах.
 * 3) `editCategoryStage`    — обновляет `NAME`/`name`/`title` одной стадии.
 *
 * При `domain === 'all'` операция выполняется для всех порталов
 * (смарт должен существовать в PortalDB для каждого).
 *
 * Аналог {@link PbxDealCategoryManageUseCase}, только адресует смарт по
 * `(smartName, group)` и использует {@link SmartCategoryStageStrategy}.
 */
@Injectable()
export class PbxSmartCategoryManageUseCase {
    private readonly logger = new Logger(PbxSmartCategoryManageUseCase.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly portalSmartService: PortalSmartService,
        private readonly categoryService: BtxCategoryService,
        private readonly stageRepository: BtxStageRepository,
        private readonly categorySync: InstallCategorySyncService,
        private readonly stageSync: InstallStageSyncService,
        private readonly strategy: SmartCategoryStageStrategy,
    ) {}

    async deleteCategories(
        dto: DeleteSmartCategoriesDto,
    ): Promise<PerPortalSmartCategoryDeleteResult[]> {
        const domains = await this.resolveDomains(dto.domain);
        const results: PerPortalSmartCategoryDeleteResult[] = [];

        for (const domain of domains) {
            const ctx = await this.resolveSmartCtx(
                domain,
                dto.smartName,
                dto.group,
            );
            if (!ctx) continue;
            const { portalId, smartDbId, entityTypeId, bitrix, parent } = ctx;
            const entityTypeIdStr = String(entityTypeId);

            const dbCategories = await this.categoryService.findByEntity(
                PbxEntityType.SMART,
                smartDbId,
            );
            const requested = new Set(dto.codes);
            const targets = dbCategories.filter(c => requested.has(c.code));
            const notFoundCodes = dto.codes.filter(
                c => !dbCategories.some(d => d.code === c),
            );

            const deletedBxCategoryIds: number[] = [];
            const deletedDbCategoryIds: number[] = [];

            for (const cat of targets) {
                const bxCategoryId = Number(cat.bitrixId);
                if (!Number.isFinite(bxCategoryId) || bxCategoryId <= 0) {
                    this.logger.warn(
                        `skip default/unknown category code=${cat.code} bitrixId=${cat.bitrixId}`,
                    );
                    continue;
                }
                await this.stageSync.deleteAllStagesInCategory({
                    bitrix,
                    entityTypeId,
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
        dto: DeleteSmartCategoryStageDto,
    ): Promise<PerPortalSmartStageOperationResult[]> {
        const domains = await this.resolveDomains(dto.domain);
        const results: PerPortalSmartStageOperationResult[] = [];

        for (const domain of domains) {
            const ctx = await this.resolveSmartCtx(
                domain,
                dto.smartName,
                dto.group,
            );
            if (!ctx) continue;
            const { portalId, smartDbId, entityTypeId, bitrix } = ctx;

            const target = await this.findCategoryAndStage(
                smartDbId,
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
            const bxLookup = await this.findBxStatus(
                bitrix,
                entityTypeId,
                category,
                stage,
            );

            let bxResult: PerPortalSmartStageOperationResult['bx'] = {
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

            let db: PerPortalSmartStageOperationResult['db'];
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
        dto: EditSmartCategoryStageDto,
    ): Promise<PerPortalSmartStageOperationResult[]> {
        const domains = await this.resolveDomains(dto.domain);
        const results: PerPortalSmartStageOperationResult[] = [];

        for (const domain of domains) {
            const ctx = await this.resolveSmartCtx(
                domain,
                dto.smartName,
                dto.group,
            );
            if (!ctx) continue;
            const { portalId, smartDbId, entityTypeId, bitrix } = ctx;

            const target = await this.findCategoryAndStage(
                smartDbId,
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
            const bxLookup = await this.findBxStatus(
                bitrix,
                entityTypeId,
                category,
                stage,
            );

            let bxResult: PerPortalSmartStageOperationResult['bx'] = {
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

            let db: PerPortalSmartStageOperationResult['db'];
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

    private async resolveSmartCtx(
        domain: string,
        smartName: string,
        group: string,
    ): Promise<{
        portalId: number;
        smartDbId: number;
        entityTypeId: number;
        bitrix: BitrixService;
        parent: InstallCategoryParent;
    } | null> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            this.logger.warn(`portal not found for domain ${domain}`);
            return null;
        }
        const portalId = Number(portal.id);
        const smart = await this.portalSmartService.findFirstByPortalTypeGroup(
            BigInt(portalId),
            smartName,
            group,
        );
        if (!smart) {
            this.logger.warn(
                `smart not found for domain ${domain} type=${smartName} group=${group}`,
            );
            return null;
        }
        const { bitrix } = await this.pbxService.init(domain);
        const parent: InstallCategoryParent = {
            entityType: PbxEntityTypePrisma.SMART,
            entityDbId: smart.id,
            parentType: 'smart',
        };
        return {
            portalId,
            smartDbId: Number(smart.id),
            entityTypeId: Number(smart.entityTypeId),
            bitrix,
            parent,
        };
    }

    private async findCategoryAndStage(
        smartDbId: number,
        categoryCode: string,
        stageCode: string,
    ): Promise<{
        category: BtxCategoryResponseDto;
        stage: BtxStageResponseDto;
    } | null> {
        const dbCategories = await this.categoryService.findByEntity(
            PbxEntityType.SMART,
            smartDbId,
        );
        const category = dbCategories.find(c => c.code === categoryCode);
        if (!category) return null;
        const stage = (category.stages ?? []).find(s => s.code === stageCode);
        if (!stage) return null;
        return { category, stage };
    }

    private async findBxStatus(
        bitrix: BitrixService,
        entityTypeId: number,
        category: BtxCategoryResponseDto,
        stage: BtxStageResponseDto,
    ): Promise<{ statusId: string; row: IBXStatus | null }> {
        const bxCategoryId = Number(category.bitrixId);
        const entityId = this.strategy.statusEntityId(
            entityTypeId,
            bxCategoryId,
        );
        const statusId = this.strategy.statusId(
            entityTypeId,
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
): PerPortalSmartStageOperationResult {
    return {
        domain,
        portalId,
        bx: { statusId: null, bxId: null, ok: false, error },
        db: { ok: false, error },
    };
}
