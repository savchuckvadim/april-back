import { Logger } from '@nestjs/common';
import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { EventReportContext } from '../context/event-report.context';
import { EEventReportEntityType } from '../init/event-report-init.types';
import {
    EDealRole,
    EventReportEntityFieldsModel,
} from '../entity/event-report-entity-fields.model';
import {
    composeStageId,
    getPresentationTargetStageCode,
} from './deal-target-stage.calculator';

/**
 * Результат работы pres-flow: ID новой pres-сделки (для unplanned/plan)
 * либо `null`, если новая сделка не создана.
 *
 * Использется TaskFlowService для привязки задачи и SalesPresentationListFlow
 * для KPI/Презентации-листа.
 */
export interface PresentationDealFlowResult {
    newPlanPresDealId: string | null;
    newUnplannedPresDealId: string | null;
}

/**
 * Воронка sales_presentation — 4 ветви:
 *  1. report=presentation + currentPresDeal → update stage + entity fields
 *     (done/expired/fail/success);
 *  2. plan=presentation → add новой pres-сделки + entity fields + связь с
 *     корневой sales_base (`to_base_sales`) + опц. UF_CRM_TO_BASE_TMC;
 *  3. isUnplannedPresentation → add ещё одной pres-сделки сразу в done +
 *     entity fields + `to_base_sales`;
 *  4. isPresentationCanceled → update текущей pres-сделки в fail (только
 *     STAGE_ID — legacy ведёт себя так же).
 *
 * `baseDealId` приходит от {@link SalesBaseDealService} — это реальный ID или
 * `$result[set_base_deal]` ссылка из того же batch. В обоих случаях запись в
 * `UF_CRM_TO_BASE_SALES` свяжет pres-сделку с корневой.
 */
export class SalesPresentationDealService {
    private readonly logger = new Logger(SalesPresentationDealService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    queue(
        ctx: EventReportContext,
        baseDealId: string | null,
    ): PresentationDealFlowResult {
        const result: PresentationDealFlowResult = {
            newPlanPresDealId: null,
            newUnplannedPresDealId: null,
        };

        if (ctx.isNoCall) return result;

        const category = this.portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_presentation,
        );
        if (!category) {
            this.logger.warn('sales_presentation category not configured');
            return result;
        }
        const categoryId = category.bitrixId;

        // 1) Update текущей pres-сделки (report=presentation, отчёт по презентации)
        if (
            ctx.reportEventType === 'presentation' &&
            ctx.currentPresDeal &&
            !ctx.isPresentationCanceled
        ) {
            const action = this.deriveReportAction(ctx);
            const stage = getPresentationTargetStageCode({
                category,
                eventAction: action,
                isResult: ctx.isResult,
            });
            if (stage) {
                // Отчёт идёт ПО ЭТОЙ сделке: если презентация состоялась,
                // засчитывается она именно здесь.
                const entityFields = this.buildEntityFields(
                    ctx,
                    ctx.currentPresDeal as Record<string, unknown>,
                    baseDealId,
                    true,
                );
                const cmd = `update_pres_deal_${ctx.currentPresDeal.ID}`;
                this.bitrix.batch.deal.update(
                    cmd,
                    Number(ctx.currentPresDeal.ID),
                    {
                        ...(entityFields as Partial<IBXDeal>),
                        STAGE_ID: composeStageId(categoryId, stage),
                    },
                );
            }
        }

        // 2) Создание новой pres-сделки под план
        if (ctx.planEventType === 'presentation') {
            const stage = getPresentationTargetStageCode({
                category,
                eventAction: 'plan',
                isResult: ctx.isResult,
            });
            if (stage) {
                const cmd = 'set_pres_deal';
                // Сделка заводится ПОД ПЛАН — презентации на ней ещё не было.
                const entityFields = this.buildEntityFields(
                    ctx,
                    null,
                    baseDealId,
                    false,
                );
                const fields: Partial<IBXDeal> = {
                    ...(entityFields as Partial<IBXDeal>),
                    ...ctx.ownerLinkFields,
                    TITLE: `Презентация ${ctx.planEventName}`,
                    CATEGORY_ID: String(categoryId),
                    STAGE_ID: composeStageId(categoryId, stage),
                    ASSIGNED_BY_ID: String(ctx.planResponsibleId),
                };
                if (ctx.currentTmcDeal) {
                    (fields as Record<string, unknown>).UF_CRM_TO_BASE_TMC =
                        String(ctx.currentTmcDeal.ID);
                }
                this.bitrix.batch.deal.set(cmd, fields);
                result.newPlanPresDealId = `$result[${cmd}]`;
            }
        }

        // 3) Незапланированная презентация — сразу в done
        if (ctx.isUnplannedPresentation) {
            const stage = getPresentationTargetStageCode({
                category,
                eventAction: 'done',
                isResult: ctx.isResult,
            });
            if (!stage) {
                // Молчаливый скип здесь уже прятал потерю события —
                // несопоставленная стадия обязана быть видна в логах.
                this.logger.warn(
                    'unplanned presentation: стадия done не сопоставлена в sales_presentation — сделка не создана',
                );
            }
            if (stage) {
                const cmd = 'set_unplanned_pres_deal';
                // Незапланированная презентация уже состоялась — сделка
                // создаётся сразу фактом.
                const entityFields = this.buildEntityFields(
                    ctx,
                    null,
                    baseDealId,
                    true,
                );
                const fields: Partial<IBXDeal> = {
                    ...(entityFields as Partial<IBXDeal>),
                    ...ctx.ownerLinkFields,
                    TITLE: 'Презентация (незапланированная)',
                    CATEGORY_ID: String(categoryId),
                    STAGE_ID: composeStageId(categoryId, stage),
                    ASSIGNED_BY_ID: String(ctx.planResponsibleId),
                };
                this.bitrix.batch.deal.set(cmd, fields);
                result.newUnplannedPresDealId = `$result[${cmd}]`;
            }
        }

        // 4) Отмена текущей презентации — только STAGE_ID (legacy так же)
        if (ctx.isPresentationCanceled && ctx.currentPresDeal) {
            const stage = getPresentationTargetStageCode({
                category,
                eventAction: 'fail',
                isResult: ctx.isResult,
            });
            if (stage) {
                const cmd = `cancel_pres_deal_${ctx.currentPresDeal.ID}`;
                this.bitrix.batch.deal.update(
                    cmd,
                    Number(ctx.currentPresDeal.ID),
                    { STAGE_ID: composeStageId(categoryId, stage) },
                );
            }
        }

        return result;
    }

    /**
     * `presentationHappenedHere` — состоялась ли презентация на ЭТОЙ
     * pres-сделке (см. `DealFieldsOptions`). Каждая из трёх веток знает это
     * про себя: обновляемая текущая и незапланированная — да, новая под
     * план — ещё нет.
     */
    private buildEntityFields(
        ctx: EventReportContext,
        deal: Record<string, unknown> | null,
        baseDealId: string | null,
        presentationHappenedHere: boolean,
    ): Record<string, unknown> {
        return new EventReportEntityFieldsModel(
            this.portal,
            ctx,
            EEventReportEntityType.DEAL,
            {
                deal,
                role: EDealRole.PRESENTATION,
                baseDealId,
                presentationHappenedHere,
            },
        ).toFields();
    }

    private deriveReportAction(
        ctx: EventReportContext,
    ): 'done' | 'expired' | 'fail' | 'noresult' | 'success' {
        if (ctx.isSuccessSale) return 'success';
        if (ctx.isFail) return 'fail';
        if (ctx.isExpired) return 'expired';
        if (!ctx.isResult) return 'noresult';
        return 'done';
    }
}
