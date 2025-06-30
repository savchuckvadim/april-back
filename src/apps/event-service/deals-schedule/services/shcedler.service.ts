// scheduler.service.ts
import { TelegramService } from '@/modules/telegram/telegram.service';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue } from 'bull';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { InjectQueue } from '@nestjs/bull';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';


@Injectable()
export class SchedulerService {
    private readonly logger = new Logger(SchedulerService.name);

    constructor(
        private readonly telegramService: TelegramService,
        private readonly dispatcher: QueueDispatcherService
    ) { }

    @Cron(CronExpression.EVERY_DAY_AT_5AM, { timeZone: 'Europe/Moscow' })
    async handleDailyTasks() {
        this.logger.log('⏰ Scheduled task started at 05:00');

        try {
            // await this.queue.add(JobNames.SERVICE_DEAL_MOVE_STAGES, {})
            await this.dispatcher.dispatch(QueueNames.SERVICE_DEALS_SCHEDULE, JobNames.SERVICE_DEAL_MOVE_STAGES, {})
        } catch (err) {
            await this.telegramService.sendMessage('SCHEDLER Ошибка',);
            this.logger.error('Ошибка в handleDailyTasks', err);
        }
    }
}
