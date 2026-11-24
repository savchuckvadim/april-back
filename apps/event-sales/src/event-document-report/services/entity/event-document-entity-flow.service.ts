import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { IBatchGroupBuffer } from '../../../shared/batch/batch-group-buffer.interface';
import { EVENT_DOCUMENT_WRITE_CMD } from '../../constants/event-document-flow.const';
import { EventDocumentContext } from '../context/event-document.context';
import { EventDocumentEntityFieldsModel } from './event-document-entity-fields.model';

/**
 * Поля КОМПАНИИ по событию «документ сформирован». Поля сделок пишут
 * сервисы воронок (`services/deal`): там же решается стадия, и на сделку
 * уходит одна команда, а не две.
 *
 * Не `@Injectable`: инстанс Битрикса свой у каждого события (CLAUDE.md).
 */
export class EventDocumentEntityFlowService {
    private readonly logger = new Logger(EventDocumentEntityFlowService.name);

    constructor(private readonly bitrix: BitrixService) {}

    queue(ctx: EventDocumentContext, buffer: IBatchGroupBuffer): void {
        if (!ctx.company) {
            this.logger.warn(
                `[document-flow] ${ctx.domain}: компания ${ctx.companyId} не прочитана — ` +
                    'её поля не обновляются',
            );
            return;
        }
        const fields = new EventDocumentEntityFieldsModel(
            ctx,
            'company',
            ctx.company,
        ).toFields();
        if (!Object.keys(fields).length) return;
        buffer.queue(() =>
            this.bitrix.batch.company.update(
                EVENT_DOCUMENT_WRITE_CMD.company,
                ctx.companyId,
                fields,
            ),
        );
    }
}
