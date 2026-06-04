// scheduler.service.ts
import { TelegramService } from '@lib/telegram/telegram.service';
import { Injectable, Logger } from '@nestjs/common';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';

@Injectable()
export class MoveDealQueueService {
    private readonly logger = new Logger(MoveDealQueueService.name);

    constructor(
        private readonly telegramService: TelegramService,
        private readonly dispatcher: QueueDispatcherService,
    ) {}

    async moveDeals() {
        try {
            // await this.queue.add(JobNames.SERVICE_DEAL_MOVE_STAGES, {})
            await this.dispatcher.dispatch(
                QueueNames.SERVICE_DEALS_SCHEDULE,
                JobNames.SERVICE_DEAL_MOVE_STAGES,
                {},
            );
        } catch (err) {
            await this.telegramService.sendMessage('SCHEDLER Ошибка');
            this.logger.error('Ошибка в handleDailyTasks', err);
        }
    }
}
