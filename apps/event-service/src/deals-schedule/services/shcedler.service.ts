// scheduler.service.ts
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { MoveDealQueueService } from '../../deals-move/services/move-deal-queue.service';
import { TelegramService } from '@lib/telegram/telegram.service';
import { DealsOrderQueueService } from '../../deals-order/services/queue/deals-order-queue.service';
import { SmartActQueueService } from '../../smart-act/services';
import { actualizeDealsFinReportPusher } from '../utils/actualizar-deals-finreport.pusher';

const MOSCOW_TZ = 'Europe/Moscow';

enum CronJobName {
    MOVE_DEALS = 'moveDeals',
    CHECK_DEALS_EVERY_WEEK = 'checkDealsEveryWeek',
    ACTUALIZE_FIN_SERVICES_WITH_TASKS = 'actualizeDealsFinServicesWithTasks',
}

@Injectable()
export class SchedulerService implements OnApplicationBootstrap {
    private readonly logger = new Logger(SchedulerService.name);

    constructor(
        private readonly moveDealQueueService: MoveDealQueueService,
        private readonly dealsOrderQueueService: DealsOrderQueueService,
        private readonly smartActQueueService: SmartActQueueService,
        private readonly telegramService: TelegramService,
        private readonly schedulerRegistry: SchedulerRegistry,
    ) {}

    /**
     * Диагностика: при старте приложения логируем все зарегистрированные
     * cron-задачи и их ближайшие даты запуска — сразу видно, что job
     * зарегистрирован и когда он реально сработает по мнению планировщика.
     */
    onApplicationBootstrap() {
        const jobs = this.schedulerRegistry.getCronJobs();
        const lines: string[] = [];
        jobs.forEach((job, name) => {
            const nextRuns = job
                .nextDates(2)
                .map(d => d.setZone(MOSCOW_TZ).toFormat('yyyy-MM-dd HH:mm:ss'))
                .join(', ');
            const line = `${name}: next runs (msk) ${nextRuns}`;
            lines.push(line);
            this.logger.log(`CRON registered: ${line}`);
        });
        if (!lines.length) {
            this.logger.error('CRON: no jobs registered in SchedulerRegistry');
        }
        void this.telegramService.sendMessage(
            `🕒 event-service SCHEDLER started, jobs:\n${lines.join('\n')}`,
        );
    }

    @Cron(CronExpression.EVERY_5_HOURS, {
        name: CronJobName.MOVE_DEALS,
        timeZone: MOSCOW_TZ,
    })
    async handleDailyTasks() {
        this.logger.log(`CRON fired: ${CronJobName.MOVE_DEALS}`);
        await this.telegramService.sendMessage(
            `⏰ EVERY_5_HOURS SCHEDLER MoveDealStagesService start ${this.getMoscowTimeLabel()}`,
        );

        try {
            await this.moveDealQueueService.moveDeals();
            this.logger.log(`CRON done: ${CronJobName.MOVE_DEALS}`);
        } catch (err) {
            await this.telegramService.sendMessage('SCHEDLER Ошибка');
            this.logger.error(`Ошибка в ${CronJobName.MOVE_DEALS}`, err);
        }
    }

    // @Cron('0 0 10 * * 1', { timeZone: MOSCOW_TZ }) // Monday 10:00
    @Cron('0 0 15 * * 5', {
        name: CronJobName.CHECK_DEALS_EVERY_WEEK,
        timeZone: MOSCOW_TZ,
    }) // Friday 15:00
    async checkDealsEveryWeek() {
        this.logger.log(`CRON fired: ${CronJobName.CHECK_DEALS_EVERY_WEEK}`);
        await this.telegramService.sendMessage(
            `⏰EVERY_WEEK SCHEDLER check Deals Ork start ${this.getMoscowTimeLabel()}`,
        );

        try {
            await this.dealsOrderQueueService.sendDealsWarnings();
            this.logger.log(`CRON done: ${CronJobName.CHECK_DEALS_EVERY_WEEK}`);
        } catch (err) {
            await this.telegramService.sendMessage('SCHEDLER Ошибка');
            this.logger.error(
                `Ошибка в ${CronJobName.CHECK_DEALS_EVERY_WEEK}`,
                err,
            );
        }
    }
    //TODO smart act - обрабатывать акты по расписанию- раз в неделю

    /*
     * для gsr пересчитывает акты и ставит задачи менеджерам раз в неделю
     *
     */
    @Cron('0 25 20 * * 4', {
        name: CronJobName.ACTUALIZE_FIN_SERVICES_WITH_TASKS,
        timeZone: MOSCOW_TZ,
    }) // Четверг 20:25
    async actualizeDealsFinServicesWithTasks() {
        this.logger.log(
            `CRON fired: ${CronJobName.ACTUALIZE_FIN_SERVICES_WITH_TASKS}`,
        );
        const domain = 'gsr.bitrix24.ru';
        const withTasks = true;
        const message = 'Actualize Deals Fin Services With Tasks';
        const name = 'ActualizeDealsFinServicesWithTasks';

        try {
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
            this.logger.log(
                `CRON done: ${CronJobName.ACTUALIZE_FIN_SERVICES_WITH_TASKS}`,
            );
        } catch (err) {
            await this.telegramService.sendMessage('SCHEDLER Ошибка');
            this.logger.error(
                `Ошибка в ${CronJobName.ACTUALIZE_FIN_SERVICES_WITH_TASKS}`,
                err,
            );
        }
    }

    private getMoscowTimeLabel(): string {
        const date = new Date(
            new Date().toLocaleString('en-US', { timeZone: MOSCOW_TZ }),
        );
        return `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()} ${MOSCOW_TZ}`;
    }
}
