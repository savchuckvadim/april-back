import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { QueueDispatcherService } from '@lib/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@lib/queue/constants/queue-names.enum';
import { JobNames } from '@lib/queue/constants/job-names.enum';
import {
    OfferWordMultiGenerateDto,
    OfferWordMultiGenerateResponseDto,
} from '../../dto/offer-word-multi-generate.dto';
import { OfferWordMultiGenerateUseCase } from '../../use-cases/offer-word-multi-generate.use-case';

/** Постановка генерации КП v2 в очередь; withoutQueue — синхронно. */
@Injectable()
export class OfferGenerateMultiQueueService {
    constructor(
        private readonly queueDispatcher: QueueDispatcherService,
        private readonly useCase: OfferWordMultiGenerateUseCase,
    ) {}

    async start(
        dto: OfferWordMultiGenerateDto,
    ): Promise<OfferWordMultiGenerateResponseDto> {
        if (dto.withoutQueue) {
            const result = await this.useCase.execute(dto);
            return { operationId: null, result };
        }
        const operationId = randomUUID();
        await this.queueDispatcher.dispatch(
            QueueNames.KONSTRUCTOR,
            JobNames.OFFER_GENERATE_MULTI,
            { dto, operationId },
            operationId,
        );
        return { operationId, result: null };
    }
}
