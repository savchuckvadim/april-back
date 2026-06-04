import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BitrixOwnerTypeId } from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx';
import { PortalDealService } from '@/modules/pbx-domain';
import { PortalStoreService } from '@lib/portal-konstructor/portal/portal-store.service';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { Category } from '@app/pbx-install/shared';
import {
    EnsuredSmartCategoryRow,
    InstallCategoryParent,
} from '@app/pbx-install/category';
import { InstallCategorySyncService } from '@app/pbx-install/category/install-category-sync.service';
import { BootstrapPortalCategoryStagesUseCase } from '@app/pbx-install/stage/use-cases/bootstrap-portal-category-stages.use-case';
import { ReconcilePortalCategoryStagesUseCase } from '@app/pbx-install/stage/use-cases/reconcile-portal-category-stages.use-case';
import { DealCategoryStageStrategy } from './deal-category-stage.strategy';

/** Сводный результат установки воронок и стадий сделки. */
export interface InstallDealCategoriesResult {
    dealId: number;
    parent: InstallCategoryParent;
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
 * Алгоритм:
 * 1. `ensureTemplateCategories` — upsert воронок шаблона в Bitrix + зеркала в `btx_categories`.
 * 2. Для каждой воронки — bootstrap (если только что создана) или reconcile (если уже жила) стадий.
 *
 * Установка НЕ удаляет существующие воронки сделок, которых нет в шаблоне («сироты»):
 * это позволяет ставить отдельную воронку по имени, не затрагивая остальные funnel-ы клиента.
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
        private readonly bootstrapStages: BootstrapPortalCategoryStagesUseCase,
        private readonly reconcileStages: ReconcilePortalCategoryStagesUseCase,
        private readonly strategy: DealCategoryStageStrategy,
    ) {}

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
        // Установка НЕ удаляет «осиротевшие» воронки: ставим/обновляем только воронки
        // из шаблона, а все прочие существующие воронки сделок на портале не трогаем
        // (иначе установка одной воронки снесла бы остальные funnel-ы клиента).

        // Шаг 1: создаём/обновляем шаблонные воронки в Bitrix + зеркала в БД.
        const ensured: EnsuredSmartCategoryRow[] =
            await this.categorySync.ensureTemplateCategories({
                bitrix,
                entityTypeId: this.entityTypeId,
                parent,
                templateCategories,
                strategy: this.strategy,
            });

        // Шаг 2: стадии по каждой воронке.
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
