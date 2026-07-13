import { QueueDispatcherService } from '@lib/queue/dispatch/queue-dispatcher.service';
import { ZakupkiOfferCreateDto } from '../dto/zakupki-offer.dto';
import { JobNames } from '@lib/queue/constants/job-names.enum';
import { randomUUID } from 'crypto';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ZakupkiOfferQueueService {
    constructor(private readonly queueDispatcher: QueueDispatcherService) {}

    async start(dto: ZakupkiOfferCreateDto): Promise<string> {
        const operationId = randomUUID();
        await this.queueDispatcher.dispatch(
            QueueNames.ZAKUPKI_OFFER,
            JobNames.ZAKUPKI_OFFER_GENERATE,
            { dto, operationId },
            operationId,
        );
        return operationId;
    }
}
