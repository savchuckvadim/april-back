import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { ZakupkiOfferCreateDto } from '../dto/zakupki-offer.dto';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { randomUUID } from 'crypto';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
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
