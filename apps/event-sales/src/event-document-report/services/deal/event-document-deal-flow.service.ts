import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { IBatchGroupBuffer } from '../../../shared/batch/batch-group-buffer.interface';
import { EventDocumentContext } from '../context/event-document.context';
import { DocumentBaseDealService } from './document-base-deal.service';
import { DocumentPresentationDealService } from './document-presentation-deal.service';

/**
 * Сделки потока документов: основная и, для документа «после презентации»,
 * сделка презентации. Зеркало `EventReportDealFlowService` отчёта о звонке —
 * одна точка входа на все воронки.
 */
export class EventDocumentDealFlowService {
    private readonly baseDeal: DocumentBaseDealService;
    private readonly presentationDeal: DocumentPresentationDealService;

    constructor(bitrix: BitrixService, portal: PortalModel) {
        this.baseDeal = new DocumentBaseDealService(bitrix, portal);
        this.presentationDeal = new DocumentPresentationDealService(bitrix);
    }

    queue(ctx: EventDocumentContext, buffer: IBatchGroupBuffer): void {
        this.baseDeal.queue(ctx, buffer);
        if (ctx.isAfterPresentation) this.presentationDeal.queue(ctx, buffer);
    }
}
