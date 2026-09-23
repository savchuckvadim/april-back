/**
 * Крон ретенции снапшотов AI-аналитики отдельным модулем (план Фазы 3,
 * П5). Подключать ТОЛЬКО в приложении, где поднят
 * `ScheduleModule.forRoot()`: без него декоратор `@Cron` молча не
 * срабатывает, и модуль создавал бы вид работающей чистки.
 *
 * Сейчас планировщик поднят в `apps/kpi-report-sales`, `apps/event-sales`
 * и `apps/event-service`; в `apps/admin` его нет, поэтому админ-модуль
 * этот модуль НЕ импортирует — ручка `POST admin/ai-analytics/
 * retention/run` работает и без крона.
 *
 * Расписание — ежедневно по UTC (см. шапку
 * `ai-analytics-retention.scheduler.ts`: локальный час портала считает
 * утилита приложения, библиотеке она недоступна).
 */
import { Module } from '@nestjs/common';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings';
import { AiAnalyticsRetentionScheduler } from './ai-analytics-retention.scheduler';
import { SalesAiAnalyticsOpsModule } from './sales-ai-analytics-ops.module';

@Module({
    imports: [SalesAiAnalyticsOpsModule, PortalAppSettingsModule],
    providers: [AiAnalyticsRetentionScheduler],
    exports: [AiAnalyticsRetentionScheduler],
})
export class SalesAiAnalyticsRetentionCronModule {}
