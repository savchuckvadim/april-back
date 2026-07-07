// scheduler.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MoveDealQueueService } from '../../deals-move/services/move-deal-queue.service';
import { TelegramService } from '@lib/telegram/telegram.service';
import { DealsOrderQueueService } from '../../deals-order/services/queue/deals-order-queue.service';
import { SmartActQueueService } from '../../smart-act/services';
import { actualizeDealsFinReportPusher } from '../utils/actualizar-deals-finreport.pusher';

@Injectable()
export class SchedulerService {
    private readonly logger = new Logger(SchedulerService.name);

    constructor(
        private readonly moveDealQueueService: MoveDealQueueService,
        private readonly dealsOrderQueueService: DealsOrderQueueService,
        private readonly smartActQueueService: SmartActQueueService,
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
            `⏰ EVERY_5_HOURS SCHEDLER MoveDealStagesService start ${hours}:${minutes}:${seconds} ${timezone}`,
        );

        try {
            // await this.queue.add(JobNames.SERVICE_DEAL_MOVE_STAGES, {})
            await this.moveDealQueueService.moveDeals();
        } catch (err) {
            await this.telegramService.sendMessage('SCHEDLER Ошибка');
            this.logger.error('Ошибка в handleDailyTasks', err);
        }
    }

    // @Cron('0 0 10 * * 1', { timeZone: 'Europe/Moscow' }) // Monday 10:00
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
    //TODO smart act - обрабатывать акты по расписанию- раз в неделю

    /*
     * для gsr пересчитывает акты
     *
     */
    // @Cron(CronExpression.EVERY_3_HOURS, { timeZone: 'Europe/Moscow' }) // c понедельника по пятницу без задач
    // async actualizeDealsFinServicesWithoutTasks() {
    //     const domain = 'gsr.bitrix24.ru';
    //     const withTasks = false;
    //     const message = 'Actualize Deals Fin Services Without Tasks';
    //     const name = 'ActualizeDealsFinServicesWithoutTasks';
    //     this.logger.log('every day  8 pm');
    //     await this.telegramService.sendMessage(
    //         'actualizeDealsFinServicesWithoutTasks pre pusher every day  8 pm',
    //     );
    //     await actualizeDealsFinReportPusher({
    //         telegramService: this.telegramService,
    //         loggerService: this.logger,
    //         callBack: async () =>
    //             await this.smartActQueueService.send(
    //                 domain,
    //                 withTasks,
    //                 undefined,
    //             ),
    //         message,
    //         name,
    //     });
    // }
    /*
     * для gsr пересчитывает акты и ставит задачи менеджерам раз в неделю
     *
     */
    @Cron('0 25 20 * * 4', { timeZone: 'Europe/Moscow' }) // Четверг 20:25
    async actualizeDealsFinServicesWithTasks() {
        const domain = 'gsr.bitrix24.ru';
        const withTasks = true;
        const message = 'Actualize Deals Fin Services Without Tasks';
        const name = 'ActualizeDealsFinServicesWithoutTasks';

        await this.telegramService.sendMessage(
            'пересчитывает акты и ставит задачи менеджерам раз в неделю Четверг 20:25',
        );
        await actualizeDealsFinReportPusher({
            telegramService: this.telegramService,
            loggerService: this.logger,
            callBack: async () =>
                await this.smartActQueueService.send(
                    domain,
                    withTasks,
                    undefined,
                ),
            message,
            name,
        });
    }
}
