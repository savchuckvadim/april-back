import { Module } from '@nestjs/common';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { CallReportAnalyticsCoreModule } from './call-report-analytics-core.module';
import { CallReportAnalyticsController } from './controllers/call-report-analytics.controller';
import { CallReportAnalyticsSnapshotScheduler } from './call-report-analytics-snapshot.scheduler';

/**
 * Отчёты по AI-аналитике звонков — переносимый модуль (единая точка входа
 * с HTTP и кроном).
 *
 * Подключение в любой app одним импортом:
 *   imports: [CallReportAnalyticsModule]
 * — приезжают endpoints /call-report/analytics/* и программный фасад
 * CallReportAnalyticsService (ядро CallReportAnalyticsCoreModule
 * реэкспортируется целиком — как и раньше, фасад доступен потребителю).
 *
 * Нужны только сервисы без HTTP (другое приложение, свой Swagger) —
 * импортируйте CallReportAnalyticsCoreModule.
 *
 * Зависимости — только БД и Redis; Bitrix/LLM модулю не нужны: отчёты
 * строятся из уже накопленных данных. Подробности — в README.md рядом.
 */
@Module({
    imports: [
        CallReportAnalyticsCoreModule,
        // Снапшот-крон идёт по включённым порталам portal_ai_settings
        PortalStoreModule,
    ],
    controllers: [CallReportAnalyticsController],
    providers: [
        // Weekly-снапшоты профилей порталов (по включённым порталам БД,
        // требует ScheduleModule.forRoot в app-потребителе)
        CallReportAnalyticsSnapshotScheduler,
    ],
    exports: [CallReportAnalyticsCoreModule],
})
export class CallReportAnalyticsModule {}
