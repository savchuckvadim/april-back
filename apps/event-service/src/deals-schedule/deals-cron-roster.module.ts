import { Module } from '@nestjs/common';
import {
    CRON_JOBS_ROSTER_SOURCE,
    staticCronJobsRoster,
} from '@lib/core/schedule';
import { DEALS_CRON_ROSTER } from './deals-cron-roster';

/**
 * Сведения о кронах отдела сервиса для стартового отчёта
 * (`CronJobsReportModule.forRoot({ imports: [DealsCronRosterModule] })`).
 * Набор статичный: у кронов нет настроек по порталам, в БД ходить незачем.
 */
@Module({
    providers: [
        {
            provide: CRON_JOBS_ROSTER_SOURCE,
            useValue: staticCronJobsRoster(DEALS_CRON_ROSTER),
        },
    ],
    exports: [CRON_JOBS_ROSTER_SOURCE],
})
export class DealsCronRosterModule {}
