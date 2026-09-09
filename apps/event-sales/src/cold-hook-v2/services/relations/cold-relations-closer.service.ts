import { Logger } from '@nestjs/common';
import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { IBXTask } from '@/modules/bitrix/domain/tasks/task';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { hasCrmLink } from '@lib/portal-lib/pbx/const-smart-registry';
import { PresentationSmartInfo } from '@lib/portal-lib/pbx/pbx-presentation-smart';
import { ZprSmartInfo } from '@lib/portal-lib/pbx/pbx-zpr-smart';
import { presUfKey } from '../../../presentation-flow/services/pres-element-fields.builder';
import { presStageId } from '../../../presentation-flow/services/pres-stage.resolver';
import { zprUfKey } from '../../../zpr-flow/services/zpr-element-fields.builder';
import { zprStageId } from '../../../zpr-flow/services/zpr-stage.resolver';
import { ColdStartDecision } from '../../lib/cold-force.decision';
import {
    DEAL_TO_DEAL_LINK_CODES,
    dealLinkKey,
    toLinkedIds,
} from '../../lib/deal-link-fields';
import { PortalDealColdCategoryService } from '../enities/deal/portal-deal-cold-category.service';
import { ColdTarget } from '../target/cold-target.types';
import {
    ColdRelations,
    ColdSmartRelations,
    SmartRow,
} from './cold-relations.types';

type Row = Record<string, unknown>;

/**
 * Поля «оси планов» сделки, которые обнуляются вместе с закрытием: у
 * закрытой сделки следующего события нет, а даты в карточке иначе врали бы.
 * Основной сделке/компании даты перепишет сама холодная работа (v1).
 */
const DEAL_PLAN_DATE_CODES = [
    'call_next_date',
    'call_next_name',
    'next_pres_plan_date',
    'xo_date',
    'xo_name',
] as const;

export interface ColdCloseResult {
    closedDealIds: number[];
    completedTaskIds: number[];
    closedPresIds: number[];
    closedZprIds: number[];
    /**
     * Сохранённая основная — её use-case обновляет как `baseDeal` (v1:
     * свежая `sales_base` компании; у корня-сделки — корень). В `yield` —
     * null: новая работа не создаётся.
     */
    preservedBaseDeal: IBXDeal | null;
}

/**
 * Закрытие открытой работы клиента перед холодным стартом (шаг 5 плана v2).
 *
 *  - `proceed` (force=Y либо чужой работы нет): как v1 — все открытые сделки
 *    четырёх воронок в стадию double/noresult своей воронки, кроме
 *    сохраняемой основной; ПЛЮС задачи, элементы презентаций
 *    (→ `pres_noresult`) и ЗПР (→ `zpr_fail`), даты планов закрываемых сделок;
 *  - `yield` (force=N, клиент у другого сотрудника): только входная сделка и
 *    её граф — `to_*`-ссылки входной и сделки, ссылающиеся на неё через
 *    `to_base_sales`; чужие основные и всё, что к ним привязано, не трогаем.
 *
 * Свой батч ДО создания (как v1): команд закрытия может быть больше 50, в
 * группу буфера создания они не помещаются.
 */
export class ColdRelationsCloserV2Service {
    private readonly logger = new Logger(ColdRelationsCloserV2Service.name);
    private readonly categories: PortalDealColdCategoryService;

    constructor(
        private readonly portal: PortalModel,
        private readonly bitrix: BitrixService,
    ) {
        this.categories = new PortalDealColdCategoryService(portal);
    }

    async close(
        target: ColdTarget,
        relations: ColdRelations,
        decision: ColdStartDecision,
    ): Promise<ColdCloseResult> {
        const preserved =
            decision.mode === 'proceed'
                ? this.preservedBaseDeal(target, relations)
                : null;
        const scope =
            decision.mode === 'proceed'
                ? this.proceedScope(relations, preserved)
                : this.yieldScope(target, relations, decision);

        const result: ColdCloseResult = {
            closedDealIds: [],
            completedTaskIds: [],
            closedPresIds: [],
            closedZprIds: [],
            preservedBaseDeal: preserved,
        };
        const clearedDates = this.clearedPlanDates();

        for (const deal of scope.deals) {
            const stageId =
                this.categories.getNoresultDealSageIdByCategoryBitrixId(
                    String(deal.CATEGORY_ID),
                );
            if (!stageId) {
                this.logger.warn(
                    `[close] hook=${target.hookKey} deal=${deal.ID}: у воронки ${deal.CATEGORY_ID} нет стадии double/noresult — пропуск`,
                );
                continue;
            }
            this.bitrix.batch.deal.update(
                `xo2_close_deal_${target.hookKey}_${deal.ID}`,
                Number(deal.ID),
                { STAGE_ID: stageId, ...clearedDates } as Partial<IBXDeal>,
            );
            result.closedDealIds.push(Number(deal.ID));
        }

        for (const task of scope.tasks) {
            const id = this.taskId(task);
            if (!id) continue;
            this.bitrix.batch.task.complete(
                `xo2_complete_task_${target.hookKey}_${id}`,
                id,
            );
            result.completedTaskIds.push(id);
        }

        result.closedPresIds = this.closeElements(
            target,
            relations.pres,
            scope.presRows,
            relations.pres.info
                ? presStageId(relations.pres.info, 'pres_noresult')
                : undefined,
            'pres',
        );
        result.closedZprIds = this.closeElements(
            target,
            relations.zpr,
            scope.zprRows,
            relations.zpr.info
                ? zprStageId(relations.zpr.info, 'zpr_fail')
                : undefined,
            'zpr',
        );

        const commands =
            result.closedDealIds.length +
            result.completedTaskIds.length +
            result.closedPresIds.length +
            result.closedZprIds.length;
        if (commands) {
            await this.bitrix.api.callBatchWithConcurrency(2);
        }
        this.logger.log(
            `[close] hook=${target.hookKey} mode=${decision.mode}: deals=${result.closedDealIds.length} ` +
                `tasks=${result.completedTaskIds.length} pres=${result.closedPresIds.length} ` +
                `zpr=${result.closedZprIds.length} preservedBase=${preserved?.ID ?? '-'}`,
        );
        return result;
    }

    // ---------- объём закрытия ----------

    /**
     * Сохраняемая основная: у корня-сделки — корень, если он открыт; иначе
     * (и у корня-компании) — свежая открытая `sales_base` (max ID, как v1).
     *
     * Фолбэк для корня-сделки обязателен (ревью 02.09): у ХО-сделки из
     * lead-to-work `to_base_sales` нет, корень — null, а своя открытая
     * основная находится по `LEAD_ID`; без фолбэка она закрывалась бы как
     * дубль, а use-case заводил бы вторую основную тому же клиенту.
     */
    private preservedBaseDeal(
        target: ColdTarget,
        relations: ColdRelations,
    ): IBXDeal | null {
        if (target.kind === 'deal') {
            const root = relations.openBaseDeals.find(
                deal => Number(deal.ID) === target.rootDealId,
            );
            if (root) return root;
        }
        return relations.openBaseDeals.reduce<IBXDeal | null>(
            (latest, deal) =>
                latest === null || Number(deal.ID) > Number(latest.ID)
                    ? deal
                    : latest,
            null,
        );
    }

    private proceedScope(relations: ColdRelations, preserved: IBXDeal | null) {
        return {
            deals: relations.deals.filter(
                deal => Number(deal.ID) !== Number(preserved?.ID ?? 0),
            ),
            tasks: relations.tasks,
            presRows: relations.pres.rows,
            zprRows: relations.zpr.rows,
        };
    }

    /**
     * Граф входной сделки: она сама, её `to_*`-ссылки, корень (если не
     * чужой) и сделки, ссылающиеся на них через `to_base_sales`. Чужие
     * основные из решения — вне графа вместе со всем, что на них ссылается.
     */
    private yieldScope(
        target: ColdTarget,
        relations: ColdRelations,
        decision: ColdStartDecision,
    ) {
        const entry = target.entryDeal;
        const foreign = new Set(decision.foreign.map(item => item.dealId));
        const roots = new Set<number>();
        if (entry) {
            roots.add(Number(entry.ID));
            for (const code of DEAL_TO_DEAL_LINK_CODES) {
                for (const id of toLinkedIds(
                    (entry as unknown as Row)[dealLinkKey(this.portal, code)],
                    /^D_/i,
                )) {
                    roots.add(id);
                }
            }
        }
        if (target.rootDealId) roots.add(target.rootDealId);
        for (const id of foreign) roots.delete(id);

        const toBaseKey = dealLinkKey(this.portal, 'to_base_sales');
        const graph = new Set<number>();
        for (const deal of relations.deals) {
            const id = Number(deal.ID);
            if (foreign.has(id)) continue;
            const refs = toLinkedIds(
                (deal as unknown as Row)[toBaseKey],
                /^D_/i,
            );
            if (roots.has(id) || refs.some(ref => roots.has(ref))) {
                graph.add(id);
            }
        }
        const graphIds = [...graph];
        const deals = relations.deals.filter(deal =>
            graph.has(Number(deal.ID)),
        );
        const tasks = relations.tasks.filter(task =>
            this.taskBindings(task).some(binding =>
                graphIds.some(id => binding === `D_${id}`),
            ),
        );
        return {
            deals,
            tasks,
            presRows: this.rowsLinkedTo(
                relations.pres.rows,
                graphIds,
                relations.pres.info
                    ? [
                          presUfKey(relations.pres.info, 'PRES_BASE_DEAL'),
                          presUfKey(relations.pres.info, 'PRES_DEAL'),
                          presUfKey(relations.pres.info, 'PRES_TMC_DEAL'),
                      ]
                    : [],
            ),
            zprRows: this.rowsLinkedTo(
                relations.zpr.rows,
                graphIds,
                relations.zpr.info
                    ? [
                          zprUfKey(relations.zpr.info, 'ZPR_BASE_DEAL'),
                          zprUfKey(relations.zpr.info, 'ZPR_PRES_DEAL'),
                      ]
                    : [],
            ),
        };
    }

    // ---------- элементы ----------

    private closeElements<Info extends { entityTypeId: number }>(
        target: ColdTarget,
        smart: ColdSmartRelations<Info>,
        rows: SmartRow[],
        stageId: string | undefined,
        kind: 'pres' | 'zpr',
    ): number[] {
        if (!smart.info || !rows.length) return [];
        if (!stageId) {
            this.logger.warn(
                `[close] hook=${target.hookKey} ${kind}: закрывающей стадии нет на портале — ${rows.length} элементов не закрыты`,
            );
            return [];
        }
        const ids: number[] = [];
        for (const row of rows) {
            const id = Number(row['id']);
            if (!Number.isFinite(id) || id <= 0) continue;
            this.bitrix.batch.item.update(
                `xo2_close_${kind}_${target.hookKey}_${id}`,
                id,
                String(smart.info.entityTypeId) as never,
                { stageId } as never,
            );
            ids.push(id);
        }
        return ids;
    }

    private rowsLinkedTo(
        rows: SmartRow[],
        dealIds: number[],
        keys: Array<string | undefined>,
    ): SmartRow[] {
        const linkKeys = keys.filter((key): key is string => Boolean(key));
        return rows.filter(row =>
            linkKeys.some(key =>
                dealIds.some(id => hasCrmLink(row[key], 'D', id)),
            ),
        );
    }

    // ---------- утилиты ----------

    /** Обнуление оси планов у закрываемой сделки — пустой строкой (канон). */
    private clearedPlanDates(): Record<string, ''> {
        const cleared: Record<string, ''> = {};
        for (const code of DEAL_PLAN_DATE_CODES) {
            const field = this.portal.getEntityFieldByCode('deal', code);
            if (field?.bitrixId) cleared[`UF_CRM_${field.bitrixId}`] = '';
        }
        return cleared;
    }

    private taskId(task: IBXTask): number {
        const raw = task as unknown as Row;
        const id = Number(raw['id'] ?? raw['ID']);
        return Number.isFinite(id) && id > 0 ? id : 0;
    }

    private taskBindings(task: IBXTask): string[] {
        const raw = task as unknown as Row;
        const value = raw['ufCrmTask'] ?? raw['UF_CRM_TASK'];
        return Array.isArray(value) ? value.map(item => String(item)) : [];
    }
}
