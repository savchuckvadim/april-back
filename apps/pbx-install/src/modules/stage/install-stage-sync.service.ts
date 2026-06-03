import { Injectable, Logger } from '@nestjs/common';
import { BitrixService, IBXStatus } from '@/modules/bitrix';
import { BtxStageRepository } from '@/modules/pbx-domain/stage';
import {
    normalizeBitrixStageColor,
    normalizeStatusListResult,
    toSort,
} from '../shared/utils/bitrix-category-stage.utils';
import type { SyncStagesForCategoryArgs } from './sync-stages-for-category.args';
import { Stage } from '../shared';
import { BitrixCategoryStageStrategy } from '../category';

/** Параметры нижнего уровня: то же, что у use case, плюс режим wipe перед заливкой. */
export type SyncStagesForCategoryParams = SyncStagesForCategoryArgs & {
    resetStagesBeforeSync?: boolean;
};

/**
 * Справочник стадий (`crm.status.*`) для воронки.
 *
 * Алгоритм один и тот же для смартов, сделок и RPA. Конкретику Bitrix-форматов
 * (`ENTITY_ID`, `STATUS_ID`, `SEMANTICS`) предоставляет {@link BitrixCategoryStageStrategy},
 * который пробрасывается оркестратором (`InstallSmartCategoriesService` и т.п.).
 *
 * Два режима вызываются через use case (рекомендуется) или напрямую:
 * - **Bootstrap** — `resetStagesBeforeSync: true`: только что созданная воронка; Bitrix уже подставил дефолтные стадии с «чужими» SORT/S — их удаляем и ставим только шаблон.
 * - **Reconcile** — `resetStagesBeforeSync: false`: воронка уже жила; добавляем/меняем/удаляем стадии относительно текущего шаблона без полного обнуления.
 *
 * В `crm.status.add` только поля из документации Bitrix; `isDefault` не передаём (400).
 */
@Injectable()
export class InstallStageSyncService {
    private readonly logger = new Logger(InstallStageSyncService.name);

    constructor(private readonly stageRepository: BtxStageRepository) {}

    async deleteAllStagesInCategory(params: {
        bitrix: BitrixService;
        entityTypeId: number;
        bxCategoryId: number;
        strategy: BitrixCategoryStageStrategy;
    }): Promise<void> {
        const { bitrix, entityTypeId, bxCategoryId, strategy } = params;
        const entityId = strategy.statusEntityId(entityTypeId, bxCategoryId);
        const list = await bitrix.status.getList({ ENTITY_ID: entityId });
        const rows = normalizeStatusListResult(list.result);
        for (const row of rows) {
            if (row.ID == null) continue;
            await this.deleteStatusForced(bitrix, row.ID);
        }
    }

    async deleteStatusForced(
        bitrix: BitrixService,
        statusPkId: string | number,
    ): Promise<void> {
        try {
            await bitrix.api.call('crm.status.delete', {
                id: statusPkId,
                params: { FORCED: 'Y' },
            });
            return;
        } catch (e) {
            this.logger.warn(
                `crm.status.delete FORCED id=${String(statusPkId)}: ${this.describeBxError(e)}`,
            );
        }

        try {
            await bitrix.status.delete(statusPkId);
        } catch (e) {
            // Системные/защищённые стадии Bitrix (финальные WON/LOSE, SYSTEM='Y',
            // стадии с привязанными элементами) удалить нельзя — Bitrix отдаёт 400.
            // Пропускаем такую стадию: одна неудаляемая стадия не должна рушить
            // установку всей воронки. Реальную причину пишем из ответа Bitrix.
            this.logger.warn(
                `crm.status.delete id=${String(statusPkId)} пропущена (не удаляется): ${this.describeBxError(e)}`,
            );
        }
    }

    /** Достаёт реальный текст ошибки Bitrix из ответа axios (а не общее «status code 400»). */
    private describeBxError(e: unknown): string {
        const err = e as {
            response?: { data?: unknown };
            message?: string;
        };
        const data = err?.response?.data;
        if (data != null) {
            return typeof data === 'string' ? data : JSON.stringify(data);
        }
        return err?.message ?? String(e);
    }

    /**
     * Синхронизация стадий одной воронки с шаблоном.
     *
     * Порядок шагов:
     * 1) Отсортировать стадии шаблона по `order` (SORT в Bitrix) — иначе возможна ошибка «промежуточная после успешной».
     * 2) При bootstrap — удалить все текущие `crm.status` по ENTITY_ID воронки (включая системные дефолты новой категории).
     * 3) Загрузить актуальный список статусов из Bitrix.
     * 4) Для каждой стадии шаблона (в порядке SORT): семантика из стратегии, update или add, затем upsert строки в `btx_stages`.
     * 5) Удалить из Bitrix статусы, которых нет в шаблоне (по STATUS_ID).
     * 6) Удалить из БД портала стадии, чьих `code` нет в шаблоне.
     */
    async syncStagesForCategory(
        params: SyncStagesForCategoryParams,
    ): Promise<void> {
        const {
            bitrix,
            entityTypeId,
            bxCategoryId,
            portalCategoryId,
            stages,
            strategy,
            resetStagesBeforeSync = false,
        } = params;

        const sortedStages = this.sortStagesByTemplateOrder(stages);
        const entityId = strategy.statusEntityId(entityTypeId, bxCategoryId);

        // Шаг 2 (только bootstrap): чистый лист в Bitrix перед заливкой шаблона.
        if (resetStagesBeforeSync) {
            await this.deleteAllStagesInCategory({
                bitrix,
                entityTypeId,
                bxCategoryId,
                strategy,
            });
        }

        // Шаг 3: актуальное состояние Bitrix после возможного wipe.
        const listBefore = await bitrix.status.getList({ ENTITY_ID: entityId });
        const currentRows = normalizeStatusListResult(listBefore.result);

        const expectedStatusIds = new Set(
            sortedStages.map(s =>
                strategy.statusId(
                    entityTypeId,
                    bxCategoryId,
                    String(s.bitrixId),
                ),
            ),
        );

        // Шаг 4: применяем шаблон по возрастанию SORT.
        for (const stage of sortedStages) {
            const statusId = strategy.statusId(
                entityTypeId,
                bxCategoryId,
                String(stage.bitrixId),
            );
            const sort = toSort(stage.order);
            const color = normalizeBitrixStageColor(stage.color, this.logger);
            const name = String(stage.title || stage.name);
            const semantics = strategy.resolveStageSemantics(stage);

            const existing = currentRows.find(r => r.STATUS_ID === statusId);

            const fields: Partial<IBXStatus> = {
                ENTITY_ID: entityId,
                STATUS_ID: statusId,
                NAME: name,
                SORT: sort,
                COLOR: color,
                ...(semantics ? { SEMANTICS: semantics } : {}),
            };

            if (existing?.ID != null) {
                await bitrix.status.update(existing.ID, {
                    NAME: name,
                    SORT: sort,
                    COLOR: color,
                    ...(semantics ? { SEMANTICS: semantics } : {}),
                });
            } else {
                await bitrix.status.add(fields);
            }

            await this.upsertPortalStage(portalCategoryId, stage);
        }

        // Шаг 5: в Bitrix не должно остаться статусов вне шаблона.
        const listAfterFetch = await bitrix.status.getList({
            ENTITY_ID: entityId,
        });
        const rowsAfter = normalizeStatusListResult(listAfterFetch.result);
        for (const row of rowsAfter) {
            const sid = row.STATUS_ID;
            if (!sid || expectedStatusIds.has(sid)) continue;
            if (row.ID != null) {
                await this.deleteStatusForced(bitrix, row.ID);
            }
        }

        // Шаг 6: в БД портала убираем стадии, которых больше нет в шаблоне.
        const portalStages =
            await this.stageRepository.findByCategoryId(portalCategoryId);
        const keepCodes = new Set(sortedStages.map(s => String(s.code)));
        for (const ps of portalStages ?? []) {
            if (!keepCodes.has(ps.code)) {
                await this.stageRepository.delete(ps.id);
            }
        }
    }

    /** Шаг 1 шаблона: стабильный порядок для crm.status.* (Bitrix не любит «промежуточную» после SUCCESS по SORT). */
    private sortStagesByTemplateOrder(stages: Stage[]): Stage[] {
        return [...stages].sort((a, b) => Number(a.order) - Number(b.order));
    }

    private async upsertPortalStage(
        portalCategoryId: number,
        stage: Stage,
    ): Promise<void> {
        const portalStages =
            await this.stageRepository.findByCategoryId(portalCategoryId);
        const found = portalStages?.find(
            s =>
                s.code === String(stage.code) ||
                s.bitrixId === String(stage.bitrixId),
        );

        const payload = {
            btx_category_id: BigInt(portalCategoryId),
            name: String(stage.name),
            title: String(stage.title),
            code: String(stage.code),
            bitrixId: String(stage.bitrixId),
            color: normalizeBitrixStageColor(stage.color, this.logger),
            isActive: Boolean(stage.isActive),
        };

        if (found) {
            await this.stageRepository.update(found.id, payload);
        } else {
            await this.stageRepository.create(payload);
        }
    }
}
