import { Injectable, Logger } from '@nestjs/common';
import { BitrixOwnerTypeId, BitrixService } from '@/modules/bitrix';
import { BtxCategoryRepository } from '@/modules/pbx-domain/category';
import { PbxEntityTypePrisma } from '@/shared/enums';
import {
    BxCategoryRow,
    normalizeCode,
    yn,
    toSort,
} from '../shared/utils/bitrix-category-stage.utils';
import { Category } from '../smart/type/parse.type';
import { EnsuredSmartCategoryRow } from './install-smart-template.types';

/**
 * Воронки CRM в Bitrix (`crm.category.*`) и зеркало в `btx_categories`.
 * Переиспользуемо для других сценариев install (deal/rpa), если передать тот же Bitrix + шаблон воронок.
 *
 * Стадии — в InstallStageSyncService (`crm.status.*`).
 */
@Injectable()
export class InstallCategorySyncService {
    private readonly logger = new Logger(InstallCategorySyncService.name);

    constructor(private readonly categoryRepository: BtxCategoryRepository) { }

    async listCategories(
        bitrix: BitrixService,
        entityTypeIdStr: BitrixOwnerTypeId | string,
    ): Promise<BxCategoryRow[]> {
        const res = await bitrix.category.getList(entityTypeIdStr);
        const list = res.result?.categories ?? [];
        return list as BxCategoryRow[];
    }

    async deleteBitrixCategory(
        bitrix: BitrixService,
        bxCategoryId: number,
        entityTypeIdStr: BitrixOwnerTypeId | string,
    ): Promise<void> {
        await bitrix.category.delete(bxCategoryId, entityTypeIdStr);
    }

    async deletePortalCategoryByBitrixId(
        smartDbId: bigint,
        bitrixCategoryId: string,
    ): Promise<void> {
        const existing = await this.categoryRepository.findByEntity(
            PbxEntityTypePrisma.SMART,
            Number(smartDbId),
        );
        const row = existing?.find(c => c.bitrixId === bitrixCategoryId);
        if (row) {
            await this.categoryRepository.delete(row.id);
        }
    }

    /**
     * Синхронизирует воронки из шаблона (`templateCategories`) с Bitrix и таблицей `btx_categories` для смарта.
     *
     * 1. Приводит `entityTypeId` к строке — так ожидает Bitrix API владельца смарт-процесса.
     * 2. Загружает текущий список воронок в CRM (`crm.category.list`) для этого `entityTypeId`.
     * 3. Для каждой категории шаблона:
     *    — нормализует код и ищет воронку в Bitrix с тем же кодом;
     *    — собирает поля (название, sort, code, isDefault, title);
     *    — если воронка есть — обновляет её в Bitrix; если нет — создаёт (`crm.category.add`) и кладёт в локальный список;
     *    — при неуспешном add без id — пропускает категорию с предупреждением в лог;
     *    — upsert строки в нашей БД (`btx_categories`) через `upsertPortalCategory` (связка SMART + smartDbId + bitrixId);
     *    — добавляет в результат `{ cat, bxCategoryId, portalCategoryId, isNewCategory }`.
     * 4. Возвращает массив сопоставлений шаблон ↔ Bitrix ↔ portal row для дальнейших шагов install (например стадии).
     */
    async ensureTemplateCategories(
        bitrix: BitrixService,
        entityTypeId: number,
        smartDbId: bigint,
        templateCategories: Category[],
    ): Promise<EnsuredSmartCategoryRow[]> {
        const entityTypeIdStr = String(entityTypeId);
        // Шаг 1–2: актуальный список воронок в Bitrix для данного смарт-процесса.
        const bxCategories = await this.listCategories(bitrix, entityTypeIdStr);
        const out: EnsuredSmartCategoryRow[] = [];

        for (const cat of templateCategories) {
            const codeNorm = normalizeCode(cat.code);
            // Шаг 3a: сопоставление с воронкой в Bitrix по нормализованному коду.
            let bxRow = bxCategories.find(
                row => normalizeCode(row.code) === codeNorm,
            );

            const sort = toSort(cat.order);
            const isDefault = yn(cat.isDefault);

            const fields = {
                name: String(cat.title || cat.name),
                sort,
                code: String(cat.code),
                isDefault,
                title: String(cat.title || cat.name),
            };

            let bxCategoryId: number;
            let isNewCategory = false;
            if (bxRow) {
                // Шаг 3b: воронка найдена — только update в CRM.
                await bitrix.category.update(bxRow.id, entityTypeIdStr, fields);
                bxCategoryId = Number(bxRow.id);
            } else {
                // Шаг 3c: воронки не было — add в CRM и добавление в локальный массив для последующих поисков.
                const added = await bitrix.category.add(
                    entityTypeIdStr,
                    fields,
                );
                const created = added.result?.category;
                if (!created?.id) {
                    this.logger.warn(
                        `crm.category.add returned no category for code=${cat.code}`,
                    );
                    continue;
                }
                bxRow = {
                    ...created,
                    code: String(cat.code),
                } as BxCategoryRow;
                bxCategories.push(bxRow);
                bxCategoryId = Number(created.id);
                isNewCategory = true;
            }

            // Шаг 3d: зеркало в БД портала (`btx_categories`).
            const portalCategoryId = await this.upsertPortalCategory({
                smartDbId,
                cat,
                bxCategoryId,
                entityTypeId,
            });

            out.push({ cat, bxCategoryId, portalCategoryId, isNewCategory });
        }

        // Шаг 4: итог для вызывающего кода (стадии и т.д.).
        return out;
    }

    private async upsertPortalCategory(args: {
        smartDbId: bigint;
        cat: Category;
        bxCategoryId: number;
        entityTypeId: number;
    }): Promise<number> {
        const { smartDbId, cat, bxCategoryId, entityTypeId } = args;
        const camelId = `DT${entityTypeId}_${bxCategoryId}`;
        const existing = await this.categoryRepository.findByEntity(
            PbxEntityTypePrisma.SMART,
            Number(smartDbId),
        );
        const found = existing?.find(c => c.code === String(cat.code));

        const payload = {
            entity_type: PbxEntityTypePrisma.SMART,
            entity_id: smartDbId,
            parent_type: 'smart',
            type: String(cat.type),
            group: String(cat.group),
            title: String(cat.title),
            name: String(cat.name),
            bitrixId: String(bxCategoryId),
            bitrixCamelId: camelId,
            code: String(cat.code),
            isActive: Boolean(cat.isActive),
        };

        if (found) {
            const updated = await this.categoryRepository.update(
                found.id,
                payload,
            );
            return updated!.id;
        }

        const created = await this.categoryRepository.create(payload);
        return created!.id;
    }
}
