import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { formatCronJobsReport, summarizeCronJobs } from './cron-jobs-report';

/**
 * При старте приложения пишет в лог и в Telegram список зарегистрированных
 * кронов с ближайшими запусками.
 *
 * Зачем: крон, у которого нет работы, молчит, и снаружи не отличить
 * «крон жив, но ему нечего делать» от «крон не зарегистрирован вовсе».
 * Сообщение при старте снимает второй вариант сразу после деплоя.
 *
 * Кроны монтирует глобальный ScheduleModule в своём onApplicationBootstrap,
 * а хуки глобальных модулей Nest вызывает первыми — к нашему хуку реестр
 * уже полон.
 */
@Injectable()
export class CronJobsReporter implements OnApplicationBootstrap {
    private readonly logger = new Logger(CronJobsReporter.name);

    constructor(private readonly registry: SchedulerRegistry) {}

    onApplicationBootstrap(): void {
        const jobs = summarizeCronJobs(this.registry.getCronJobs());
        const message = formatCronJobsReport(jobs);
        if (jobs.length) {
            this.logger.log(message, { telegram: true });
            return;
        }
        this.logger.error(message, { telegram: true });
    }
}
