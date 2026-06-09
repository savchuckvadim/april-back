import { Injectable, Logger } from '@nestjs/common';
import { BitrixService, IBxRpaStage } from '@/modules/bitrix';
import {
    BtxCategoryRepository,
    BtxStageRepository,
    PortalCategoryEntity,
} from '@lib/portal-lib/pbx-domain/category';
import { PbxEntityTypePrisma } from '@/shared/enums';
import { bigintConvertToNumber } from '@/shared';
import { RpaCategory, RpaStage } from '../../type/parse.type';

export interface InstallRpaCategoriesParams {
    bitrix: BitrixService;
    /** Id типа RPA в Bitrix (`rpa.type`). */
    rpaTypeId: number;
    /** Строка `btx_rpas.id` — якорь для зеркала категории. */
    rpaDbId: bigint;
    /** Единственная категория RPA из шаблона. */
    category: RpaCategory;
}

export interface InstallRpaCategoriesResult {
    portalCategoryId: number;
    stagesAdded: number;
    stagesUpdated: number;
    stagesMirrored: number;
}

/**
 * Установка единственной воронки RPA и её стадий.
 *
 * В отличие от смарта (CRM-динамика: `crm.category.*` + `crm.status.*`), RPA-процесс
 * в Bitrix не имеет категорий — сам `rpa.type` является воронкой, а стадии правятся через
 * `rpa.stage.*` по `typeId`. Поэтому сервис:
 * 1. зеркалит одну категорию в `btx_categories` (entity = `BTX_RPA`);
 * 2. сверяет стадии в Bitrix (`rpa.stage.listForType` → add/update по `code`/`name`);
 * 3. зеркалит стадии в `btx_stages` (полная пересборка по категории).
 */
@Injectable()
export class InstallRpaCategoriesService {
    private readonly logger = new Logger(InstallRpaCategoriesService.name);

    constructor(
        private readonly categoryRepository: BtxCategoryRepository,
        private readonly stageRepository: BtxStageRepository,
    ) {}

    async installCategory(
        params: InstallRpaCategoriesParams,
    ): Promise<InstallRpaCategoriesResult> {
        const { bitrix, rpaTypeId, rpaDbId, category } = params;

        const portalCategory = await this.ensurePortalCategory(
            rpaDbId,
            rpaTypeId,
            category,
        );

        const { added, updated, bxStages } = await this.reconcileBitrixStages(
            bitrix,
            rpaTypeId,
            category.stages,
        );

        const mirrored = await this.mirrorPortalStages(
            portalCategory.id,
            category.stages,
            bxStages,
        );

        return {
            portalCategoryId: portalCategory.id,
            stagesAdded: added,
            stagesUpdated: updated,
            stagesMirrored: mirrored,
        };
    }

    /** Создаёт/обновляет единственную строку `btx_categories` для RPA. */
    private async ensurePortalCategory(
        rpaDbId: bigint,
        rpaTypeId: number,
        category: RpaCategory,
    ): Promise<PortalCategoryEntity> {
        const entityDbId = bigintConvertToNumber(rpaDbId);
        const data = {
            entity_type: PbxEntityTypePrisma.BTX_RPA,
            entity_id: rpaDbId,
            parent_type: 'rpa',
            type: category.type,
            group: category.group,
            title: category.title,
            name: category.name,
            bitrixId: String(rpaTypeId),
            bitrixCamelId: category.bitrixCamelId || `RPA_${rpaTypeId}`,
            code: category.code,
            isActive: category.isActive,
        };

        const existing = await this.categoryRepository.findByEntity(
            PbxEntityTypePrisma.BTX_RPA,
            entityDbId,
        );
        const current = existing?.[0];
        const result = current
            ? await this.categoryRepository.update(current.id, data)
            : await this.categoryRepository.create(data);
        if (!result) {
            throw new Error('Failed to upsert RPA category in PortalDB');
        }
        return result;
    }

    /** Сверяет стадии RPA в Bitrix: add отсутствующих, update существующих (по `code`/`name`). */
    private async reconcileBitrixStages(
        bitrix: BitrixService,
        rpaTypeId: number,
        stages: RpaStage[],
    ): Promise<{ added: number; updated: number; bxStages: IBxRpaStage[] }> {
        const existing = await this.listBitrixStages(bitrix, rpaTypeId);
        let added = 0;
        let updated = 0;

        for (const stage of stages) {
            const match = existing.find(
                e => (e.code && e.code === stage.code) || e.name === stage.name,
            );
            const fields: Partial<IBxRpaStage> = {
                typeId: rpaTypeId,
                name: stage.name,
                code: stage.code,
                color: stage.color,
                sort: stage.order,
            };
            if (stage.semantic) {
                fields.semantic = stage.semantic;
            }
            try {
                if (match?.id != null) {
                    await bitrix.rpaStage.update(match.id, fields);
                    updated++;
                } else {
                    await bitrix.rpaStage.add(fields);
                    added++;
                }
            } catch (e) {
                this.logger.warn(
                    `rpa.stage upsert failed code=${stage.code}: ${(e as Error).message}`,
                );
            }
        }

        const bxStages = await this.listBitrixStages(bitrix, rpaTypeId);
        return { added, updated, bxStages };
    }

    private async listBitrixStages(
        bitrix: BitrixService,
        rpaTypeId: number,
    ): Promise<IBxRpaStage[]> {
        const res = (await bitrix.rpaStage.listForType(rpaTypeId)) as
            | { result?: { stages?: IBxRpaStage[] } }
            | undefined;
        return res?.result?.stages ?? [];
    }

    /** Полная пересборка `btx_stages` категории по шаблону (`bitrixId` — id стадии Bitrix, если найден). */
    private async mirrorPortalStages(
        portalCategoryId: number,
        stages: RpaStage[],
        bxStages: IBxRpaStage[],
    ): Promise<number> {
        await this.stageRepository.deleteByCategoryId(portalCategoryId);
        if (stages.length === 0) return 0;

        const rows = stages.map(stage => {
            const bx = bxStages.find(
                b => (b.code && b.code === stage.code) || b.name === stage.name,
            );
            return {
                btx_category_id: BigInt(portalCategoryId),
                name: stage.name,
                title: stage.title,
                code: stage.code,
                bitrixId: bx?.id != null ? String(bx.id) : stage.bitrixId,
                color: stage.color,
                isActive: stage.isActive,
            };
        });
        return this.stageRepository.createMany(rows);
    }
}
