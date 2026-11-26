import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { QueueDispatcherService } from '@lib/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
import { JobNames } from '@lib/queue/constants/job-names.enum';
import {
    SALES_DOCUMENT_EVENT_ATTEMPTS,
    salesDocumentEventJobId,
} from '@lib/queue/constants/sales-document-event-job';
import {
    buildSalesDocumentEvent,
    SalesDocumentEventInput,
} from '../lib/build-sales-document-event';

/** Что передаёт документ: признак из запроса и данные для события. */
export interface SalesDocumentPublishInput
    extends Omit<SalesDocumentEventInput, 'eventId' | 'createdAt'> {
    /** Признак `salesFlow` из запроса: только `true` ставит событие. */
    readonly salesFlow?: boolean | null;
    /**
     * Номер события. Задаётся там, где повторный прогон одного документа
     * возможен (операция очереди): тот же номер не даст воркеру записать
     * документ дважды. Не задан: выдаётся новый UUID.
     */
    readonly eventId?: string;
    /** Момент формирования; не задан: текущий. */
    readonly createdAt?: Date;
}

/**
 * Постановка события «документ сформирован» в очередь потока продаж
 * event-sales: воркер двигает стадию основной сделки, пишет KPI и «Историю».
 *
 * Событие ставится только по явному признаку из запроса: легаси-фронт
 * сообщает о документах старым хуком, и без признака счётчики удвоились бы.
 * Сбой постановки документ не отменяет: документ уже в сделке, в лог идёт
 * предупреждение.
 */
@Injectable()
export class SalesDocumentFlowService {
    private readonly logger = new Logger(SalesDocumentFlowService.name);

    constructor(private readonly dispatcher: QueueDispatcherService) {}

    /** true: событие поставлено в очередь. Метод не бросает исключений. */
    async publish(input: SalesDocumentPublishInput): Promise<boolean> {
        if (input.salesFlow !== true) {
            return false;
        }

        try {
            const event = buildSalesDocumentEvent({
                ...input,
                eventId: input.eventId || randomUUID(),
                createdAt: input.createdAt ?? new Date(),
            });
            if (!event) {
                this.logger.warn(
                    `${input.domain}: событие потока продаж не собрано, не хватает данных (пользователь ${String(input.userId)}, компания ${String(input.companyId)}, сделка ${String(input.dealId)})`,
                );
                return false;
            }

            await this.dispatcher.dispatch(
                QueueNames.EVENT_SALES_DOCUMENT_FLOW,
                JobNames.EVENT_SALES_DOCUMENT_FLOW,
                event,
                salesDocumentEventJobId(event.eventId),
                { attempts: SALES_DOCUMENT_EVENT_ATTEMPTS },
            );
            this.logger.log(
                `${event.domain}: событие потока продаж ${event.eventId} поставлено (сделка ${event.dealId}, виды: ${event.kinds.join(', ')}${event.presentation ? ', после презентации' : ''})`,
            );
            return true;
        } catch (error) {
            this.logger.warn(
                `${input.domain}: событие потока продаж не поставлено, документ сформирован: ${error instanceof Error ? error.message : String(error)}`,
            );
            return false;
        }
    }
}
