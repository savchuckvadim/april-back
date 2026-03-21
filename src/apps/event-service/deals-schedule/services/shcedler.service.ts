// scheduler.service.ts
import { TelegramService } from '@/modules/telegram/telegram.service';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';

@Injectable()
export class SchedulerService {
    private readonly logger = new Logger(SchedulerService.name);

    constructor(
        private readonly telegramService: TelegramService,
        private readonly dispatcher: QueueDispatcherService,
    ) {}

    @Cron(CronExpression.EVERY_3_HOURS, { timeZone: 'Europe/Moscow' })
    async handleDailyTasks() {
        const now = new Date();
        const timezone = 'Europe/Moscow';
        const date = new Date(
            now.toLocaleString('en-US', { timeZone: timezone }),
        );
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const seconds = date.getSeconds();
        await this.telegramService.sendMessage(
            `⏰EVERY_3_HOURS SCHEDLER MoveDealStagesService start ${hours}:${minutes}:${seconds} ${timezone}`,
        );

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
