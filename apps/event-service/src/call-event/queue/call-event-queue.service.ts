import { Injectable } from '@nestjs/common';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { CallingEventDto } from '../dto/calling-event.dto';
import { JobNames, QueueNames } from '@lib/queue';

/**
 * Постановка события звонка в очередь BullMQ. Контроллер отвечает Bitrix
 * мгновенно, обработка идёт в воркере (см. {@link CallEventProcessor}).
 */
@Injectable()
export class CallEventQueueService {
    constructor(private readonly dispatcher: QueueDispatcherService) {}

    async enqueue(dto: CallingEventDto): Promise<void> {
        await this.dispatcher.dispatch(
            QueueNames.SERVICE_CALL_EVENT,
            JobNames.SERVICE_CALL_EVENT,
            dto,
        );
    }
}
