import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { EventReportContext } from '../context/event-report.context';
import { SalesBaseDealService } from './sales-base-deal.service';
import { SalesXoDealService } from './sales-xo-deal.service';
import {
    PresentationDealFlowResult,
    SalesPresentationDealService,
} from './sales-presentation-deal.service';
import { TmcDealService } from './tmc-deal.service';
import { DealMoveCountService } from './deal-move-count.service';

/**
 * Результат deal-flow — нужен таскам и спискам для привязки через `$result[...]`.
 */
export interface DealFlowResult {
    baseDealId: string | null;
    newPlanPresDealId: string | null;
    newUnplannedPresDealId: string | null;
}

/**
 * Оркестратор deal-flow event-report. Прогоняет 4 воронки по порядку и
 * собирает ID/$result-ссылки на новосозданные сделки.
 */
export class EventReportDealFlowService {
    private readonly logger = new Logger(EventReportDealFlowService.name);
    private readonly base: SalesBaseDealService;
    private readonly xo: SalesXoDealService;
    private readonly pres: SalesPresentationDealService;
    private readonly tmc: TmcDealService;
    private readonly moveCount: DealMoveCountService;

    constructor(bitrix: BitrixService, portal: PortalModel) {
        this.base = new SalesBaseDealService(bitrix, portal);
        this.xo = new SalesXoDealService(bitrix, portal);
        this.pres = new SalesPresentationDealService(bitrix, portal);
        this.tmc = new TmcDealService(bitrix, portal);
        this.moveCount = new DealMoveCountService(bitrix, portal);
    }

    queue(ctx: EventReportContext): DealFlowResult {
        if (!ctx.isDealFlow) {
            return {
                baseDealId: null,
                newPlanPresDealId: null,
                newUnplannedPresDealId: null,
            };
        }

        const baseDealId = this.base.queue(ctx);
        this.xo.queue(ctx);
        const presResult: PresentationDealFlowResult = this.pres.queue(
            ctx,
            baseDealId,
        );
        this.tmc.queue(ctx, presResult.newPlanPresDealId);
        // Перенос: счётчик op_move_count на текущей ХО/основной сделке
        // (todo2508-02 №6). Внутри гейт по ctx.isExpired.
        this.moveCount.queue(ctx);

        return {
            baseDealId,
            newPlanPresDealId: presResult.newPlanPresDealId,
            newUnplannedPresDealId: presResult.newUnplannedPresDealId,
        };
    }
}
