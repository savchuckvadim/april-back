import { Injectable } from '@nestjs/common';
import { PortalStoreService } from '@/modules/portal-konstructor/portal/portal-store.service';
import { PortalSmartService } from '@/modules/pbx-domain/portal-smart';
import { InstallSmartCategoriesParams } from '@/modules/pbx-install/category/install-smart-template.types';
import { normalizeCode } from '@/modules/pbx-install/shared/utils/bitrix-category-stage.utils';
import { InstallCategorySyncService } from '@/modules/pbx-install/category/install-category-sync.service';
import { InstallStageSyncService } from '@/modules/pbx-install/stage/install-stage-sync.service';
import { BootstrapPortalCategoryStagesUseCase } from '@/modules/pbx-install/stage/use-cases/bootstrap-portal-category-stages.use-case';
import { ReconcilePortalCategoryStagesUseCase } from '@/modules/pbx-install/stage/use-cases/reconcile-portal-category-stages.use-case';
import { InstallCategoryParent } from '@/modules/pbx-install/category/strategy/bitrix-category-stage.strategy';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { SmartCategoryStageStrategy } from './smart-category-stage.strategy';

/**
 * Оркестратор установки воронок и стадий смарт-процесса при инсталле из шаблона.
 *
 * Этот сервис отвечает только за смарт-специфичные шаги:
 * - резолв смарта (portal + smarts row) → `parent.entityDbId`;
 * - подстановку {@link SmartCategoryStageStrategy} (Bitrix-форматы и семантика для смартов).
 *
 * Сам алгоритм синка (удалить orphans → ensure → bootstrap/reconcile стадий)
 * живёт в `InstallCategorySyncService` / `InstallStageSyncService` и общий для смартов,
 * сделок и RPA. Аналог для сделки делает то же самое: достаёт свою db-строку и
 * подставляет `DealCategoryStageStrategy`.
 */
@Injectable()
export class InstallSmartCategoriesService {
    constructor(
        private readonly portalService: PortalStoreService,
        private readonly portalSmartService: PortalSmartService,
        private readonly categorySync: InstallCategorySyncService,
        private readonly stageSync: InstallStageSyncService,
        private readonly bootstrapStages: BootstrapPortalCategoryStagesUseCase,
        private readonly reconcileStages: ReconcilePortalCategoryStagesUseCase,
        private readonly strategy: SmartCategoryStageStrategy,
    ) {}

    async installTemplateCategories(
        params: InstallSmartCategoriesParams,
    ): Promise<void> {
        const {
            bitrix,
            domain,
            smartType,
            smartGroup,
            entityTypeId,
            templateCategories,
        } = params;

        // Нет воронок в шаблоне — нечего синхронизировать (стадии при этом в типе могут быть выключены на уровне add).
        if (templateCategories.length === 0) {
            return;
        }

        // Нужен портал и уже сохранённая строка смарта в `smarts` (связка воронок в БД идёт через id смарта).
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new Error('Portal not found');
        }

        const innerSmart =
            await this.portalSmartService.findFirstByPortalTypeGroup(
                BigInt(portal.id.toString()),
                smartType,
                smartGroup,
            );
        if (!innerSmart) {
            throw new Error('Smart not found after save');
        }

        const parent: InstallCategoryParent = {
            entityType: PbxEntityTypePrisma.SMART,
            entityDbId: innerSmart.id,
            parentType: 'smart',
        };
        const entityTypeIdStr = String(entityTypeId);
        // Набор кодов воронок из шаблона (нормализованные), чтобы отличить «лишнее» в Bitrix от «нужного».
        const templateCodes = new Set(
            templateCategories.map(c => normalizeCode(c.code)),
        );

        // Шаг 1 (очистка): все категории этого entityTypeId в Bitrix, какие есть сейчас.
        const bxCategories = await this.categorySync.listCategories(
            bitrix,
            entityTypeIdStr,
        );

        // Воронки в Bitrix, которых нет в шаблоне — кандидаты на удаление («осиротевшие»).
        const orphans = bxCategories.filter(
            row => !templateCodes.has(normalizeCode(row.code)),
        );

        // Шаг 2: для каждой лишней воронки — сначала стадии в Bitrix, потом категория в Bitrix, потом запись в нашей БД.
        for (const orphan of orphans) {
            const bxCategoryId = Number(orphan.id);
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
                String(orphan.id),
            );
        }

        // Шаг 3: создаём/обновляем воронки по шаблону в Bitrix и зеркалим в `btx_categories`; возвращает bxCategoryId + portalCategoryId.
        const ensured = await this.categorySync.ensureTemplateCategories({
            bitrix,
            entityTypeId,
            parent,
            templateCategories,
            strategy: this.strategy,
        });

        // Шаг 4: стадии по воронке — bootstrap (новая категория в Bitrix: снос дефолтных статусов + шаблон)
        // или reconcile (уже живая воронка: добиваем/правим/удаляем лишнее без полного wipe в начале).
        for (const row of ensured) {
            const payload = {
                bitrix,
                entityTypeId,
                bxCategoryId: row.bxCategoryId,
                portalCategoryId: row.portalCategoryId,
                stages: row.cat.stages ?? [],
                strategy: this.strategy,
            };
            if (row.isNewCategory) {
                //удаляет все родные стадии созданной только что воронки и создаёт новые свои
                await this.bootstrapStages.execute(payload);
            } else {
                //добивает/правим/удаляет лишнее без полного wipe в начале
                await this.reconcileStages.execute(payload);
            }
        }
    }
}
