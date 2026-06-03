import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@/modules/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@/modules/portal/services/types/deals/portal.deal.type';
import { EventReportContext } from '../context/event-report.context';
import { composeStageId } from '../deal/deal-target-stage.calculator';

/**
 * Возврат задачи в воронку ТМЦ.
 *
 * Логика legacy `EventReportReturnToTmcService.php`: если флаг
 * `returnToTmc.isActive` — текущая TMC-сделка отправляется обратно в стадию
 * `pending`, и плановая сделка (если есть) тоже синхронизируется.
 */
export class EventReportReturnToTmcService {
    private readonly logger = new Logger(EventReportReturnToTmcService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    queue(ctx: EventReportContext): void {
        if (!ctx.isNeedReturnToTmc) return;
        const tmcDeal = ctx.currentTmcDeal ?? ctx.currentTmcFromPresentation;
        if (!tmcDeal) {
            this.logger.warn('return-to-tmc: no TMC deal found');
            return;
        }
        const category = this.portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.tmc_base,
        );
        if (!category) return;
        const pendingStage = category.stages.find(
            s => s.code === 'sales_tmc_pending',
        );
        if (!pendingStage) {
            this.logger.warn('return-to-tmc: pending stage not configured');
            return;
        }
        this.bitrix.batch.deal.update(
            `return_tmc_${tmcDeal.ID}`,
            Number(tmcDeal.ID),
            {
                STAGE_ID: composeStageId(
                    category.bitrixId,
                    pendingStage.bitrixId,
                ),
            },
        );
    }
}
