import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { OfferWordByTemplateGenerateDto } from '../../dto/offer-word-generate-request.dto';
import { OfferWordByTemplateGenerateUseCase } from '../../use-cases/offer-word-by-template-generate.use-case';

@Injectable()
export class OfferGenerateQueueService {
    constructor(
        private readonly queueDispatcher: QueueDispatcherService,
        private readonly useCase: OfferWordByTemplateGenerateUseCase,
    ) {}

    async start(dto: OfferWordByTemplateGenerateDto): Promise<any> {
        if (dto.withoutQueue) {
            return await this.useCase.execute(dto);
        }
        const operationId = randomUUID();
        await this.queueDispatcher.dispatch(
            QueueNames.KONSTRUCTOR,
            JobNames.OFFER_GENERATE,
            { dto, operationId },
            operationId,
        );
        return operationId;
    }
}
