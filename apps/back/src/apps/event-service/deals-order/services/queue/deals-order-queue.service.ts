import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class DealsOrderQueueService {
    constructor(private readonly dispatcher: QueueDispatcherService) {}

    async sendDealsWarnings() {
        await this.dispatcher.dispatch(
            QueueNames.SERVICE_DEALS_ORDER,
            JobNames.SERVICE_DEALS_ORDER,
            {},
        );
    }
}
