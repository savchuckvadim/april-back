import { Module } from '@nestjs/common';
import { CronJobsReporter } from './cron-jobs-reporter.service';

/**
 * Отчёт о кронах при старте приложения (лог + Telegram).
 *
 * Подключается в корневой модуль рядом со `ScheduleModule.forRoot()`:
 * `SchedulerRegistry` приходит из него (модуль глобальный), без него
 * приложение не поднимется.
 */
@Module({
    providers: [CronJobsReporter],
})
export class CronJobsReportModule {}
