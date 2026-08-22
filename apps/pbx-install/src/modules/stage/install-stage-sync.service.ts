import { Injectable, Logger } from '@nestjs/common';
import { BitrixService, IBXStatus } from '@/modules/bitrix';
import { BtxStageRepository } from '@lib/portal-lib/pbx-domain/stage';
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

/** Что произошло со стадией: её создали или обновили существующую. */
export type StageSyncAction = 'created' | 'updated';

/** Параметры поштучной синхронизации ОДНОЙ стадии воронки. */
export interface SyncSingleStageParams {
    bitrix: BitrixService;
    entityTypeId: number;
    bxCategoryId: number;
    portalCategoryId: number;
    /** Стадия шаблона, которую ставим/обновляем. */
    stage: Stage;
    /**
     * Все стадии шаблона этой воронки — источник правды для пересчёта SORT
     * соседей. Нужны только при `reorder`.
     */
    templateStages: Stage[];
    strategy: BitrixCategoryStageStrategy;
    /**
     * Пересчитать SORT остальных стадий воронки по шаблону.
     *
     * По умолчанию ВКЛЮЧЕНО: без этого стадия, вставленная в середину
     * лестницы, встаёт в Bitrix не на своё место — соседи сохраняют старые
     * SORT, и менеджер видит её в конце воронки.
     */
    reorder?: boolean;
}

/** Итог поштучной синхронизации — что реально изменилось в Bitrix и в БД. */
export interface SyncSingleStageResult {
    statusId: string;
    bxAction: StageSyncAction;
    bxId: string | number | null;
    portalStageId: number | null;
    portalAction: StageSyncAction;
    /** STATUS_ID стадий, которым пересчитан SORT (пусто при `reorder: false`). */
    reorderedStatusIds: string[];
}

/** Результат применения одной стадии к Bitrix. */
interface ApplyStageResult {
    statusId: string;
    action: StageSyncAction;
    bxId: string | number | null;
}

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
            await this.applyStageToBitrix({
                bitrix,
                entityId,
                entityTypeId,
                bxCategoryId,
                stage,
                strategy,
                currentRows,
            });
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

    /**
     * Поштучная синхронизация ОДНОЙ стадии воронки с шаблоном.
     *
     * Отличие от {@link syncStagesForCategory}: НИЧЕГО НЕ УДАЛЯЕТ — ни в
     * Bitrix, ни в БД портала. Полный синк считает шаблон исчерпывающим и
     * сносит всё, чего в нём нет; здесь же шаблон сужен до одной строки, и
     * такое поведение стёрло бы воронку целиком.
     *
     * Шаги:
     * 1) upsert `crm.status` целевой стадии (add при отсутствии, update при наличии);
     * 2) upsert строки в `btx_stages`;
     * 3) при `reorder` (по умолчанию ВКЛ) — пересчитать SORT остальных
     *    стадий воронки по шаблону. Правится ТОЛЬКО SORT: имена, цвета и
     *    семантику соседей поштучная операция не трогает.
     */
    async syncSingleStage(
        params: SyncSingleStageParams,
    ): Promise<SyncSingleStageResult> {
        const {
            bitrix,
            entityTypeId,
            bxCategoryId,
            portalCategoryId,
            stage,
            templateStages,
            strategy,
            reorder = true,
        } = params;

        const entityId = strategy.statusEntityId(entityTypeId, bxCategoryId);
        const listBefore = await bitrix.status.getList({ ENTITY_ID: entityId });
        const currentRows = normalizeStatusListResult(listBefore.result);

        const applied = await this.applyStageToBitrix({
            bitrix,
            entityId,
            entityTypeId,
            bxCategoryId,
            stage,
            strategy,
            currentRows,
        });

        const portal = await this.upsertPortalStage(portalCategoryId, stage);

        const reorderedStatusIds = reorder
            ? await this.reorderCategoryStages({
                  bitrix,
                  entityId,
                  entityTypeId,
                  bxCategoryId,
                  templateStages,
                  strategy,
                  skipStatusId: applied.statusId,
              })
            : [];

        this.logger.log(
            `sync stage ${String(stage.code)} → ${applied.statusId}: ` +
                `bitrix=${applied.action}, portal=${portal.action}, ` +
                `reorder=${reorderedStatusIds.length}`,
        );

        return {
            statusId: applied.statusId,
            bxAction: applied.action,
            bxId: applied.bxId,
            portalStageId: portal.stageId,
            portalAction: portal.action,
            reorderedStatusIds,
        };
    }

    /**
     * Upsert одной стадии в Bitrix (`crm.status.add` / `crm.status.update`).
     * Общий шаг полного синка и поштучного — форматы `STATUS_ID`/семантики
     * обязаны совпадать, иначе поштучная правка разъедется с установкой.
     */
    private async applyStageToBitrix(params: {
        bitrix: BitrixService;
        entityId: string;
        entityTypeId: number;
        bxCategoryId: number;
        stage: Stage;
        strategy: BitrixCategoryStageStrategy;
        currentRows: IBXStatus[];
    }): Promise<ApplyStageResult> {
        const {
            bitrix,
            entityId,
            entityTypeId,
            bxCategoryId,
            stage,
            strategy,
            currentRows,
        } = params;

        const statusId = strategy.statusId(
            entityTypeId,
            bxCategoryId,
            String(stage.bitrixId),
        );
        const sort = toSort(stage.order);
        const color = normalizeBitrixStageColor(stage.color, this.logger);
        const name = String(stage.title || stage.name);
        const semantics = strategy.resolveStageSemantics(stage);

        const mutableFields: Partial<IBXStatus> = {
            NAME: name,
            SORT: sort,
            COLOR: color,
            ...(semantics ? { SEMANTICS: semantics } : {}),
        };

        const existing = currentRows.find(r => r.STATUS_ID === statusId);
        if (existing?.ID != null) {
            await bitrix.status.update(existing.ID, mutableFields);
            return { statusId, action: 'updated', bxId: existing.ID };
        }

        const added = await bitrix.status.add({
            ENTITY_ID: entityId,
            STATUS_ID: statusId,
            ...mutableFields,
        });
        return {
            statusId,
            action: 'created',
            bxId: this.extractAddedStatusId(added),
        };
    }

    /**
     * Пересчёт SORT соседних стадий воронки по шаблону.
     *
     * Только UPDATE существующих статусов: поштучная операция не заводит и не
     * удаляет стадии — для этого есть полный install. Стадии шаблона, которых
     * на портале ещё нет, молча пропускаются.
     */
    private async reorderCategoryStages(params: {
        bitrix: BitrixService;
        entityId: string;
        entityTypeId: number;
        bxCategoryId: number;
        templateStages: Stage[];
        strategy: BitrixCategoryStageStrategy;
        skipStatusId: string;
    }): Promise<string[]> {
        const {
            bitrix,
            entityId,
            entityTypeId,
            bxCategoryId,
            templateStages,
            strategy,
            skipStatusId,
        } = params;

        // Список тянем заново: только что добавленной стадии в прежнем нет.
        const list = await bitrix.status.getList({ ENTITY_ID: entityId });
        const rows = normalizeStatusListResult(list.result);

        const reordered: string[] = [];
        for (const stage of this.sortStagesByTemplateOrder(templateStages)) {
            const statusId = strategy.statusId(
                entityTypeId,
                bxCategoryId,
                String(stage.bitrixId),
            );
            // Целевой стадии SORT уже проставлен на предыдущем шаге.
            if (statusId === skipStatusId) continue;

            const row = rows.find(r => r.STATUS_ID === statusId);
            if (row?.ID == null) continue;

            const sort = toSort(stage.order);
            if (Number(row.SORT) === sort) continue;

            await bitrix.status.update(row.ID, { SORT: sort });
            reordered.push(statusId);
        }
        return reordered;
    }

    /** `crm.status.add` отдаёт ID новой записи в `result`. */
    private extractAddedStatusId(response: unknown): string | number | null {
        if (response == null || typeof response !== 'object') return null;
        const result = (response as { result?: unknown }).result;
        if (typeof result === 'number' || typeof result === 'string') {
            return result;
        }
        return null;
    }

    /** Шаг 1 шаблона: стабильный порядок для crm.status.* (Bitrix не любит «промежуточную» после SUCCESS по SORT). */
    private sortStagesByTemplateOrder(stages: Stage[]): Stage[] {
        return [...stages].sort((a, b) => Number(a.order) - Number(b.order));
    }

    private async upsertPortalStage(
        portalCategoryId: number,
        stage: Stage,
    ): Promise<{ stageId: number | null; action: StageSyncAction }> {
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
            return { stageId: found.id, action: 'updated' };
        }
        const created = await this.stageRepository.create(payload);
        return { stageId: created?.id ?? null, action: 'created' };
    }
}
