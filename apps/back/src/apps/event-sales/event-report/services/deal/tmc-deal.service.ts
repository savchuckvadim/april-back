import { Logger } from '@nestjs/common';
import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { EventReportContext } from '../context/event-report.context';
import { EventReportEntityFieldsModel } from '../entity/event-report-entity-fields.model';
import {
    composeStageId,
    detectEventFromTmcStage,
    getTmcTargetStageCode,
} from './deal-target-stage.calculator';

/**
 * Воронка tmc_base — взаимодействие сделки ТМЦ с pres-сделкой основной воронки.
 *
 * Сценарии (см. event-report-service-map.md «Блок 1 / tmc_base»):
 *  - plan=presentation && currentTmcDeal → привязать TMC к новой pres-сделке
 *    (`UF_CRM_TO_BASE_SALES`, `UF_CRM_TO_PRESENTATION_SALES`);
 *  - report=presentation && (fail|result|success) → закрыть TMC-сделку.
 */
export class TmcDealService {
    private readonly logger = new Logger(TmcDealService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    queue(ctx: EventReportContext, newPresDealRef: string | null): void {
        if (ctx.isNeedReturnToTmc || ctx.isNoCall) return;

        const category = this.portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.tmc_base,
        );
        if (!category) {
            this.logger.warn('tmc_base category not configured');
            return;
        }
        const categoryId = category.bitrixId;

        // === plan=presentation: привязать существующую TMC к новой pres-сделке ===
        if (
            ctx.planEventType === 'presentation' &&
            ctx.currentTmcDeal &&
            newPresDealRef
        ) {
            const entityFields = new EventReportEntityFieldsModel(
                this.portal,
                ctx,
                'deal',
                {
                    deal: ctx.currentTmcDeal as Record<string, unknown>,
                    role: 'tmc',
                },
            ).toFields();
            const fields: Partial<IBXDeal> = {
                ...(entityFields as Partial<IBXDeal>),
                CATEGORY_ID: String(categoryId),
                STAGE_ID: composeStageId(categoryId, 'PRES_PLAN'),
                ASSIGNED_BY_ID: String(ctx.planResponsibleId),
            };
            (fields as Record<string, unknown>).UF_CRM_TO_BASE_SALES =
                ctx.currentBaseDeal ? String(ctx.currentBaseDeal.ID) : '';
            (fields as Record<string, unknown>).UF_CRM_TO_PRESENTATION_SALES =
                newPresDealRef;
            (
                fields as Record<string, unknown>
            ).UF_CRM_LAST_PRES_DONE_RESPONSIBLE = String(ctx.planResponsibleId);
            (fields as Record<string, unknown>).UF_CRM_MANAGER_OP = String(
                ctx.planResponsibleId,
            );

            const cmd = `update_tmc_to_pres_${ctx.currentTmcDeal.ID}`;
            this.bitrix.batch.deal.update(
                cmd,
                Number(ctx.currentTmcDeal.ID),
                fields,
            );
            return;
        }

        // === report=presentation: закрыть TMC по результату ===
        const closeTarget =
            ctx.currentTmcFromPresentation ?? ctx.currentTmcDeal;
        if (
            ctx.reportEventType === 'presentation' &&
            closeTarget &&
            (ctx.isResult || ctx.isFail || ctx.isSuccessSale)
        ) {
            const stage = getTmcTargetStageCode({
                category,
                currentStageEvent: detectEventFromTmcStage(
                    category,
                    closeTarget.STAGE_ID,
                ),
                planEventType: ctx.planEventType,
                reportEventType: ctx.reportEventType,
                isResult: ctx.isResult,
                isSuccess: ctx.isSuccessSale,
                isFail: ctx.isFail,
                isExpired: ctx.isExpired,
            });
            if (stage) {
                const entityFields = new EventReportEntityFieldsModel(
                    this.portal,
                    ctx,
                    'deal',
                    {
                        deal: closeTarget as Record<string, unknown>,
                        role: 'tmc',
                    },
                ).toFields();
                const cmd = `close_tmc_${closeTarget.ID}`;
                this.bitrix.batch.deal.update(cmd, Number(closeTarget.ID), {
                    ...(entityFields as Partial<IBXDeal>),
                    STAGE_ID: composeStageId(categoryId, stage),
                });
            }
        }
    }
}
