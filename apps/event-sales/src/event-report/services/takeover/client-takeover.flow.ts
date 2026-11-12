import { Logger } from '@nestjs/common';
import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { presUfKey } from '../../../presentation-flow/services/pres-element-fields.builder';
import { presStageId } from '../../../presentation-flow/services/pres-stage.resolver';
import { zprUfKey } from '../../../zpr-flow/services/zpr-element-fields.builder';
import { zprStageId } from '../../../zpr-flow/services/zpr-stage.resolver';
import { dealLinkKey } from '../../../cold-hook-v2/lib/deal-link-fields';
import { clearedDealPlanDates } from '../../../cold-hook-v2/services/relations/cold-relations-closer.service';
import { ColdRelationsCollectorV2Service } from '../../../cold-hook-v2/services/relations/cold-relations-collector.service';
import {
    ColdRelations,
    ColdSmartInfos,
} from '../../../cold-hook-v2/services/relations/cold-relations.types';
import { EventReportContext } from '../context/event-report.context';
import {
    composeStageId,
    getDuplicateCloseStageCode,
} from '../deal/deal-target-stage.calculator';
import { positiveId } from '../deal/deal-notice.util';
import { coldTargetForReport } from './takeover-target';
import {
    planTakeoverCleanup,
    TakeoverCleanupPlan,
    TakeoverCloseRole,
} from './takeover-cleanup.plan';
import { ClientTakeoverNotice } from './client-takeover.notice';

const EMPTY_PLAN: TakeoverCleanupPlan = {
    reassignTaskIds: [],
    completeTaskIds: [],
    closeDeals: [],
    closePresIds: [],
    closeZprIds: [],
};

const CATEGORY_BY_ROLE: Record<TakeoverCloseRole, PbxDealCategoryCodeEnum> = {
    base: PbxDealCategoryCodeEnum.sales_base,
    xo: PbxDealCategoryCodeEnum.sales_xo,
    pres: PbxDealCategoryCodeEnum.sales_presentation,
};

/**
 * Перехват клиента отчётом: всё, кроме самой забранной сделки (её
 * обновляет обычный поток отчёта — ответственный, стадия по плану):
 *  1. ДО батча — чужая работа по клиенту тем же сборщиком, что у холодного
 *     обзвона «с очищением» (сделки ОП, задачи группы продаж, «Презентации»,
 *     «ЗПР»), и план {@link planTakeoverCleanup};
 *  2. в батче, ДО команд сделок — задачи: забранной сделки переходят
 *     отчитавшемуся, прочие закрываются (сделка в финале сама закрывает свои
 *     дела, и наш complete после неё дал бы ошибку); затем сделки и
 *     элементы смартов — в стадии закрытия своих воронок;
 *  3. после батча — лента и уведомления ({@link ClientTakeoverNotice}).
 *
 * Сборщик читает задачи ОБЩИМ batch-аккумулятором инстанса, поэтому
 * `read` обязан идти до того, как отчёт начнёт ставить свои команды.
 *
 * Не @Injectable: инстанс Битрикса домена приходит в конструктор.
 */
export class ClientTakeoverFlowService {
    private readonly logger = new Logger(ClientTakeoverFlowService.name);
    private plan: TakeoverCleanupPlan = EMPTY_PLAN;
    private relations: ColdRelations | null = null;

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
        private readonly smarts: ColdSmartInfos,
        private readonly notifyPrevious: boolean,
    ) {}

    /** Чужая работа по клиенту и план — прямыми чтениями до батча отчёта. */
    async read(ctx: EventReportContext): Promise<void> {
        const takeover = ctx.takeover;
        if (!takeover) return;
        const target = coldTargetForReport(ctx);
        if (!target) return;
        try {
            this.relations = await new ColdRelationsCollectorV2Service(
                this.portal,
                this.bitrix,
            ).collect(target, this.smarts);
            this.plan = planTakeoverCleanup({
                takeover,
                deals: this.relations.deals,
                tasks: this.relations.tasks,
                presRows: this.relations.pres.rows,
                zprRows: this.relations.zpr.rows,
                categoryIds: {
                    base: this.categoryId(PbxDealCategoryCodeEnum.sales_base),
                    xo: this.categoryId(PbxDealCategoryCodeEnum.sales_xo),
                    pres: this.categoryId(
                        PbxDealCategoryCodeEnum.sales_presentation,
                    ),
                },
                linkKey: dealLinkKey(this.portal, 'to_base_sales'),
                keepDealIds: new Set(
                    [
                        ctx.currentBaseDeal,
                        ctx.currentXoDeal,
                        ctx.currentPresDeal,
                        ctx.currentTmcDeal,
                    ]
                        .map(deal => positiveId(deal?.ID))
                        .filter((id): id is number => id !== null),
                ),
                currentTaskId: positiveId(ctx.currentTask?.id),
                presLinkKeys: this.smarts.pres
                    ? [
                          presUfKey(this.smarts.pres, 'PRES_BASE_DEAL'),
                          presUfKey(this.smarts.pres, 'PRES_DEAL'),
                      ].filter((key): key is string => Boolean(key))
                    : [],
                zprLinkKeys: this.smarts.zpr
                    ? [
                          zprUfKey(this.smarts.zpr, 'ZPR_BASE_DEAL'),
                          zprUfKey(this.smarts.zpr, 'ZPR_PRES_DEAL'),
                      ].filter((key): key is string => Boolean(key))
                    : [],
            });
        } catch (error) {
            // Чужая работа не прочиталась — забранную сделку отчёт всё равно
            // обновит; закрывать вслепую нельзя.
            this.plan = EMPTY_PLAN;
            this.logger.warn(
                `[${ctx.domain}] чужая работа по клиенту не прочитана — не ` +
                    `закрывается: ${(error as Error).message}`,
            );
        }
    }

    /** Команды перехвата — в общий батч отчёта, до команд сделок. */
    queue(ctx: EventReportContext): void {
        const takeover = ctx.takeover;
        if (!takeover) return;
        const reporter = String(takeover.reporterId);
        for (const taskId of this.plan.reassignTaskIds) {
            this.bitrix.batch.task.update(
                `takeover_task_move_${taskId}`,
                taskId,
                {
                    RESPONSIBLE_ID: reporter,
                },
            );
        }
        for (const taskId of this.plan.completeTaskIds) {
            this.bitrix.batch.task.complete(
                `takeover_task_close_${taskId}`,
                taskId,
            );
        }
        const cleared = clearedDealPlanDates(this.portal);
        for (const { deal, role } of this.plan.closeDeals) {
            const stageId = this.closeStageId(role);
            if (!stageId) continue;
            this.bitrix.batch.deal.update(
                `takeover_close_${deal.ID}`,
                Number(deal.ID),
                { STAGE_ID: stageId, ...cleared } as Partial<IBXDeal>,
            );
        }
        this.closeElements('pres', this.plan.closePresIds);
        this.closeElements('zpr', this.plan.closeZprIds);
        this.logger.log(
            `[${ctx.domain}] перехват (${takeover.mode}): забрана ` +
                `#${takeover.takenDeal?.ID ?? '—'}, задач передано ` +
                `${this.plan.reassignTaskIds.length}, закрыто задач ` +
                `${this.plan.completeTaskIds.length}, сделок ` +
                `${this.plan.closeDeals.length}, презентаций ` +
                `${this.plan.closePresIds.length}, ЗПР ${this.plan.closeZprIds.length}, ` +
                `защищены ${takeover.protectedDeals.map(deal => deal.ID).join(', ') || '—'}`,
        );
    }

    /** Лента и уведомления — после батча; ошибки отчёт не роняют. */
    async notify(
        ctx: EventReportContext,
        batchResults: readonly IBitrixBatchResponseResult[],
    ): Promise<void> {
        if (!ctx.takeover) return;
        await new ClientTakeoverNotice(this.bitrix).notify(ctx, {
            plan: this.plan,
            tasks: this.relations?.tasks ?? [],
            notifyPrevious: this.notifyPrevious,
            batchResults,
        });
    }

    /** План для предпросмотра (вопрос «Забрать себе?» во фронте). */
    getPlan(): TakeoverCleanupPlan {
        return this.plan;
    }

    private categoryId(code: PbxDealCategoryCodeEnum): string | null {
        const category = this.portal.getDealCategoryByCode(code);
        return category ? String(category.bitrixId) : null;
    }

    private closeStageId(role: TakeoverCloseRole): string | null {
        const category = this.portal.getDealCategoryByCode(
            CATEGORY_BY_ROLE[role],
        );
        const stage = category
            ? getDuplicateCloseStageCode(category, role)
            : null;
        if (!category || !stage) {
            this.logger.warn(
                `перехват: у воронки ${role} нет стадии закрытия — сделки не закрыты`,
            );
            return null;
        }
        return composeStageId(category.bitrixId, stage);
    }

    private closeElements(kind: 'pres' | 'zpr', ids: readonly number[]): void {
        if (!ids.length) return;
        const target = this.elementCloseTarget(kind);
        if (!target) {
            this.logger.warn(
                `перехват: у смарта ${kind} нет стадии закрытия — ${ids.length} элементов не закрыты`,
            );
            return;
        }
        for (const id of ids) {
            this.bitrix.batch.item.update(
                `takeover_close_${kind}_${id}`,
                id,
                String(target.entityTypeId) as never,
                { stageId: target.stageId } as never,
            );
        }
    }

    /** Смарт и его стадия закрытия — как у холодного обзвона «с очищением». */
    private elementCloseTarget(
        kind: 'pres' | 'zpr',
    ): { entityTypeId: number; stageId: string } | null {
        if (kind === 'pres') {
            const info = this.smarts.pres;
            const stageId = info
                ? presStageId(info, 'pres_noresult')
                : undefined;
            return info && stageId
                ? { entityTypeId: info.entityTypeId, stageId }
                : null;
        }
        const info = this.smarts.zpr;
        const stageId = info ? zprStageId(info, 'zpr_fail') : undefined;
        return info && stageId
            ? { entityTypeId: info.entityTypeId, stageId }
            : null;
    }
}
