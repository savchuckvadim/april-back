import { DynamicModule, Module, ModuleMetadata } from '@nestjs/common';
import { CronJobsReporter } from './cron-jobs-reporter.service';

export interface CronJobsReportOptions {
    /**
     * Модули, экспортирующие `CRON_JOBS_ROSTER_SOURCE` — сведения о кронах
     * приложения (что делает, на каких порталах включён).
     */
    imports?: NonNullable<ModuleMetadata['imports']>;
}

/**
 * Отчёт о кронах при старте приложения (лог + Telegram).
 *
 * Подключается в корневой модуль рядом со `ScheduleModule.forRoot()`:
 * `SchedulerRegistry` приходит из него (модуль глобальный), без него
 * приложение не поднимется.
 *
 * Голый список кронов — `imports: [CronJobsReportModule]`; со сведениями
 * приложения — `CronJobsReportModule.forRoot({ imports: [СвойRosterModule] })`.
 */
@Module({
    providers: [CronJobsReporter],
})
export class CronJobsReportModule {
    static forRoot(options: CronJobsReportOptions = {}): DynamicModule {
        return {
            module: CronJobsReportModule,
            imports: options.imports ?? [],
            providers: [CronJobsReporter],
        };
    }
}
