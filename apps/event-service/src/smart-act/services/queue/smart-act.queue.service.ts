import { JobNames, QueueDispatcherService, QueueNames } from '@lib/queue';
import { Injectable } from '@nestjs/common';

/**
 * Сервис для отправки в очередь
 *
 */
@Injectable()
export class SmartActQueueService {
    constructor(private readonly queue: QueueDispatcherService) {}

    /**
     * @param withTasks ставить ли задачи-предупреждения ответственному (по умолчанию true).
     *                  false — синхронизировать акты без создания задач SmartActWarningTaskService.
     */
    public async send(domain: string, withTasks: boolean, dealId?: number) {
        return await this.queue.dispatch(
            QueueNames.SERVICE_GENERATE_ACTS,
            JobNames.SERVICE_GENERATE_ACTS,
            { domain, dealId, withTasks },
        );
    }
}
