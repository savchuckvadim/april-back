import { BitrixService } from '@/modules/bitrix';
import { BitrixOwnerType } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';
import { IBatchGroupBuffer } from '../../../shared/batch/batch-group-buffer.interface';
import { EVENT_DOCUMENT_WRITE_CMD } from '../../constants/event-document-flow.const';
import { EventDocumentContext } from '../context/event-document.context';
import { EventDocumentEntityFieldsModel } from '../entity/event-document-entity-fields.model';

/**
 * Сделка презентации по документу «после презентации»: те же счётчики и
 * даты, что у основной, плюс товарные строки документа. Стадия презентации
 * документом не меняется.
 */
export class DocumentPresentationDealService {
    constructor(private readonly bitrix: BitrixService) {}

    queue(ctx: EventDocumentContext, buffer: IBatchGroupBuffer): void {
        const deal = ctx.presentationDeal;
        const dealId = ctx.presentationDealId;
        if (!deal || !dealId) return;

        const fields = new EventDocumentEntityFieldsModel(
            ctx,
            'deal',
            deal,
        ).toFields();
        if (Object.keys(fields).length) {
            buffer.queue(() =>
                this.bitrix.batch.deal.update(
                    EVENT_DOCUMENT_WRITE_CMD.presentationDeal,
                    dealId,
                    fields,
                ),
            );
        }
        if (!ctx.productRows.length) return;
        buffer.queue(() =>
            this.bitrix.batch.productRow.set(
                EVENT_DOCUMENT_WRITE_CMD.presentationDealRows,
                {
                    ownerType: BitrixOwnerType.DEAL,
                    ownerId: dealId,
                    productRows: ctx.productRows.map(row => ({ ...row })),
                },
            ),
        );
    }
}
