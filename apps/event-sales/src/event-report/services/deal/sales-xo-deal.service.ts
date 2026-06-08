import { Logger } from '@nestjs/common';
import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { EventReportContext } from '../context/event-report.context';
import { EventReportEntityFieldsModel } from '../entity/event-report-entity-fields.model';
import {
    composeStageId,
    getXoTargetStageCode,
} from './deal-target-stage.calculator';

/**
 * Обновление сделки воронки ОП Холодные (sales_xo). Здесь только update —
 * новые xo-сделки в event-report flow не создаём (для этого есть cold-hook).
 */
export class SalesXoDealService {
    private readonly logger = new Logger(SalesXoDealService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    queue(ctx: EventReportContext): void {
        if (ctx.isNoCall) return;
        if (!ctx.currentXoDeal) return;

        const category = this.portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_xo,
        );
        if (!category) {
            this.logger.warn('sales_xo category not configured');
            return;
        }

        const targetStage = getXoTargetStageCode({
            category,
            reportEventType: ctx.reportEventType,
            isExpired: ctx.isExpired,
            isResult: ctx.isResult,
            isSuccess: ctx.isSuccessSale,
            isFail: ctx.isFail,
        });
        if (!targetStage) return;

        const entityFields = new EventReportEntityFieldsModel(
            this.portal,
            ctx,
            'deal',
            {
                deal: ctx.currentXoDeal as Record<string, unknown> | null,
                role: 'xo',
            },
        ).toFields();

        const fields: Partial<IBXDeal> = {
            ...(entityFields as Partial<IBXDeal>),
            CATEGORY_ID: String(category.bitrixId),
            STAGE_ID: composeStageId(category.bitrixId, targetStage),
            ASSIGNED_BY_ID: String(ctx.planResponsibleId),
        };
        if (ctx.entityType === 'company') {
            (fields as Record<string, unknown>).COMPANY_ID = String(
                ctx.entityId,
            );
        }

        const cmd = `update_xo_deal_${ctx.currentXoDeal.ID}`;
        this.bitrix.batch.deal.update(
            cmd,
            Number(ctx.currentXoDeal.ID),
            fields,
        );
    }
}
