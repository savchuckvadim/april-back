import { Module } from '@nestjs/common';
import { CRON_JOBS_ROSTER_SOURCE } from '@lib/core/schedule';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { EventSalesCronRosterService } from './event-sales-cron-roster.service';

/**
 * Сведения о кронах event-sales для стартового отчёта
 * (`CronJobsReportModule.forRoot({ imports: [EventSalesCronRosterModule] })`).
 * PortalStoreModule даёт PortalAiSettingsService (порталы AI-конвейера),
 * PortalAppSettingsModule — настройки приложения по порталам.
 */
@Module({
    imports: [PortalAppSettingsModule, PortalStoreModule],
    providers: [
        EventSalesCronRosterService,
        {
            provide: CRON_JOBS_ROSTER_SOURCE,
            useExisting: EventSalesCronRosterService,
        },
    ],
    exports: [CRON_JOBS_ROSTER_SOURCE],
})
export class EventSalesCronRosterModule {}
