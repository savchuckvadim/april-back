// scheduler.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MoveDealQueueService } from '../../deals-move/services/move-deal-queue.service';
import { TelegramService } from '@/modules/telegram/telegram.service';
import { DealsOrderQueueService } from '../../deals-order/services/queue/deals-order-queue.service';

@Injectable()
export class SchedulerService {
    private readonly logger = new Logger(SchedulerService.name);

    constructor(
        private readonly moveDealQueueService: MoveDealQueueService,
        private readonly dealsOrderQueueService: DealsOrderQueueService,
        private readonly telegramService: TelegramService,
    ) {}

    @Cron(CronExpression.EVERY_5_HOURS, { timeZone: 'Europe/Moscow' })
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
            await this.moveDealQueueService.moveDeals();
        } catch (err) {
            await this.telegramService.sendMessage('SCHEDLER Ошибка');
            this.logger.error('Ошибка в handleDailyTasks', err);
        }
    }

    @Cron('0 0 9 * * 1', { timeZone: 'Europe/Moscow' }) // Monday 09:00
    @Cron('0 0 15 * * 5', { timeZone: 'Europe/Moscow' }) // Friday 15:00
    // @Cron(CronExpression.EVERY_2_HOURS, { timeZone: 'Europe/Moscow' })
    async checkDealsEveryWeek() {
        const now = new Date();
        const timezone = 'Europe/Moscow';
        const date = new Date(
            now.toLocaleString('en-US', { timeZone: timezone }),
        );
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const seconds = date.getSeconds();
        await this.telegramService.sendMessage(
            `⏰EVERY_WEEK SCHEDLER check Deals Ork start ${hours}:${minutes}:${seconds} ${timezone}`,
        );

        try {
            console.log('checkDealsEveryWeek');
            await this.dealsOrderQueueService.sendDealsWarnings();
        } catch (err) {
            await this.telegramService.sendMessage('SCHEDLER Ошибка');
            this.logger.error('Ошибка в handleDailyTasks', err);
        }
    }
}
