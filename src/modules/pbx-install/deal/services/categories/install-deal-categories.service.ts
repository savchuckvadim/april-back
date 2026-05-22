import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BitrixOwnerTypeId } from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx';
import { PortalDealService } from '@/modules/pbx-domain';
import { PortalStoreService } from '@/modules/portal-konstructor/portal/portal-store.service';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { Category } from '@/modules/pbx-install/shared';
import { normalizeCode } from '@/modules/pbx-install/shared/utils/bitrix-category-stage.utils';
import {
    EnsuredSmartCategoryRow,
    InstallCategoryParent,
} from '@/modules/pbx-install/category';
import { InstallCategorySyncService } from '@/modules/pbx-install/category/install-category-sync.service';
import { InstallStageSyncService } from '@/modules/pbx-install/stage/install-stage-sync.service';
import { BootstrapPortalCategoryStagesUseCase } from '@/modules/pbx-install/stage/use-cases/bootstrap-portal-category-stages.use-case';
import { ReconcilePortalCategoryStagesUseCase } from '@/modules/pbx-install/stage/use-cases/reconcile-portal-category-stages.use-case';
import { DealCategoryStageStrategy } from './deal-category-stage.strategy';

/** Сводный результат установки воронок и стадий сделки. */
export interface InstallDealCategoriesResult {
    dealId: number;
    parent: InstallCategoryParent;
    deletedOrphanIds: number[];
    ensured: Array<{
        code: string;
        bxCategoryId: number;
        portalCategoryId: number;
        isNewCategory: boolean;
        stagesCount: number;
    }>;
}

/**
 * Оркестратор установки воронок и стадий сделки из шаблона.
 *
 * Полный аналог {@link InstallSmartCategoriesService}, отличается тем, что:
 * - в Bitrix `entityTypeId = 2` (legacy deal) — берётся из {@link BitrixOwnerTypeId.DEAL};
 * - в портальной БД parent — это строка из `btx_deals` (не `btx_smarts`); создаётся при первом install,
 *   если её ещё нет;
 * - используется {@link DealCategoryStageStrategy} для форматов `ENTITY_ID`/`STATUS_ID`/семантики.
 *
 * Алгоритм (общий с смартом):
 * 1. Снять «осиротевшие» воронки в Bitrix (те, которых нет в шаблоне) — сначала их стадии, затем сама категория, затем зеркало в БД.
 * 2. `ensureTemplateCategories` — upsert воронок шаблона в Bitrix + зеркала в `btx_categories`.
 * 3. Для каждой воронки — bootstrap (если только что создана) или reconcile (если уже жила) стадий.
 */
@Injectable()
export class InstallDealCategoriesService {
    private readonly logger = new Logger(InstallDealCategoriesService.name);
    private readonly entityTypeId = BitrixOwnerTypeId.DEAL;

    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly portalDealService: PortalDealService,
        private readonly categorySync: InstallCategorySyncService,
        private readonly stageSync: InstallStageSyncService,
        private readonly bootstrapStages: BootstrapPortalCategoryStagesUseCase,
        private readonly reconcileStages: ReconcilePortalCategoryStagesUseCase,
        private readonly strategy: DealCategoryStageStrategy,
    ) { }

    async installTemplateCategories(
        domain: string,
        templateCategories: Category[],
    ): Promise<InstallDealCategoriesResult> {
        if (templateCategories.length === 0) {
            throw new NotFoundException('templateCategories is empty');
        }

        const { bitrix } = await this.pbxService.init(domain);
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const portalId = Number(portal.id);

        // Сделка в портальной БД — якорь для связи `btx_categories`.
        let deal = await this.portalDealService.findByPortalId(portalId);
        if (!deal) {
            deal = await this.portalDealService.create({
                code: `deal_${domain}`,
                name: 'deal',
                title: 'deal',
                portalId,
            });
        }
        const dealId = Number(deal.id);

        const parent: InstallCategoryParent = {
            entityType: PbxEntityTypePrisma.DEAL,
            entityDbId: BigInt(dealId),
            parentType: 'deal',
        };
        const entityTypeIdStr = String(this.entityTypeId);

        const templateCodes = new Set(
            templateCategories.map(c => normalizeCode(c.code)),
        );

        // Шаг 1: подчищаем «осиротевшие» воронки в Bitrix (default-воронка id=0 в list не возвращается — её не трогаем).
        const bxCategories = await this.categorySync.listCategories(
            bitrix,
            entityTypeIdStr,
        );
        const orphans = bxCategories.filter(
            row => !templateCodes.has(normalizeCode(row.code)),
        );
        const deletedOrphanIds: number[] = [];
        for (const orphan of orphans) {
            const bxCategoryId = Number(orphan.id);
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
                String(orphan.id),
            );
            deletedOrphanIds.push(bxCategoryId);
        }

        // Шаг 2: создаём/обновляем шаблонные воронки в Bitrix + зеркала в БД.
        const ensured: EnsuredSmartCategoryRow[] =
            await this.categorySync.ensureTemplateCategories({
                bitrix,
                entityTypeId: this.entityTypeId,
                parent,
                templateCategories,
                strategy: this.strategy,
            });

        // Шаг 3: стадии по каждой воронке.
        for (const row of ensured) {
            const stages = row.cat.stages ?? [];
            const payload = {
                bitrix,
                entityTypeId: this.entityTypeId,
                bxCategoryId: row.bxCategoryId,
                portalCategoryId: row.portalCategoryId,
                stages,
                strategy: this.strategy,
            };
            if (row.isNewCategory) {
                await this.bootstrapStages.execute(payload);
            } else {
                await this.reconcileStages.execute(payload);
            }
        }

        return {
            dealId,
            parent,
            deletedOrphanIds,
            ensured: ensured.map(r => ({
                code: r.cat.code,
                bxCategoryId: r.bxCategoryId,
                portalCategoryId: r.portalCategoryId,
                isNewCategory: r.isNewCategory,
                stagesCount: r.cat.stages?.length ?? 0,
            })),
        };
    }
}
