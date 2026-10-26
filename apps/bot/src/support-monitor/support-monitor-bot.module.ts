import { Module } from '@nestjs/common';
import { SupportMonitorModule } from '@lib/support';
import { SupportMonitorScheduler } from './support-monitor.scheduler';

/**
 * Крон мониторинга линии поддержки в приложении bot. Правила, чтение
 * линии и рассылка — в @lib/support; здесь только расписание.
 */
@Module({
    imports: [SupportMonitorModule],
    providers: [SupportMonitorScheduler],
})
export class SupportMonitorBotModule {}
