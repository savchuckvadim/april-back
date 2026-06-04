import { Logger } from '@nestjs/common';
import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal/services/types/deals/portal.deal.type';
import { EventReportContext } from '../context/event-report.context';
import { EventReportEntityFieldsModel } from '../entity/event-report-entity-fields.model';
import {
    composeStageId,
    detectEventFromBaseStage,
    getSalesBaseTargetStageCode,
} from './deal-target-stage.calculator';

/**
 * Обновление/создание сделки воронки ОП Основная (sales_base).
 *
 * Возвращает идентификатор сделки (реальный либо `$result[set_base_deal]`),
 * чтобы task/list-flow могли сослаться на неё в том же batch.
 */
export class SalesBaseDealService {
    private readonly logger = new Logger(SalesBaseDealService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    queue(ctx: EventReportContext): string | null {
        if (ctx.isPostSale) return null;
        const category = this.portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
        if (!category) {
            this.logger.warn('sales_base category not configured');
            return null;
        }

        const targetStage = getSalesBaseTargetStageCode({
            category,
            currentStageEvent: detectEventFromBaseStage(
                category,
                ctx.currentBaseDeal?.STAGE_ID,
            ),
            planEventType: ctx.planEventType,
            reportEventType: ctx.reportEventType,
            isResult: ctx.isResult,
            isUnplanned: ctx.isUnplannedPresentation,
            isSuccess: ctx.isSuccessSale,
            isFail: ctx.isFail,
        });
        if (!targetStage) {
            this.logger.warn('sales_base target stage not resolved');
            return ctx.currentBaseDeal ? String(ctx.currentBaseDeal.ID) : null;
        }

        const entityFields = new EventReportEntityFieldsModel(
            this.portal,
            ctx,
            'deal',
            {
                deal: ctx.currentBaseDeal as Record<string, unknown> | null,
                role: 'base',
            },
        ).toFields();

        const baseFields: Partial<IBXDeal> = {
            ...(entityFields as Partial<IBXDeal>),
            CATEGORY_ID: String(category.bitrixId),
            STAGE_ID: composeStageId(category.bitrixId, targetStage),
            ASSIGNED_BY_ID: String(ctx.planResponsibleId),
        };
        if (ctx.entityType === 'company') {
            (baseFields as Record<string, unknown>).COMPANY_ID = String(
                ctx.entityId,
            );
        } else {
            (baseFields as Record<string, unknown>).LEAD_ID = String(
                ctx.entityId,
            );
        }

        if (ctx.currentBaseDeal) {
            const cmd = `update_base_deal_${ctx.currentBaseDeal.ID}`;
            this.bitrix.batch.deal.update(
                cmd,
                Number(ctx.currentBaseDeal.ID),
                baseFields,
            );
            return String(ctx.currentBaseDeal.ID);
        }

        const cmd = 'set_base_deal';
        this.bitrix.batch.deal.set(cmd, baseFields);
        return `$result[${cmd}]`;
    }
}
