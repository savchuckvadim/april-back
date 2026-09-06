import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '@lib/core/redis/redis.module';
import { AiModule } from '../ai/ai.module';
import { TranscriptionStoreModule } from '../transcription/transcription-store.module';
import { CallReportAnalyticsService } from './call-report-analytics.service';
import { CallReportAnalyticsDataService } from './services/call-report-analytics-data.service';
import { CallReportAnalyticsAggregatorService } from './services/call-report-analytics-aggregator.service';
import { CallReportAnalyticsCacheService } from './services/call-report-analytics-cache.service';
import { CallReportAnalyticsHistoryService } from './services/call-report-analytics-history.service';

/**
 * Ядро отчётов по AI-аналитике звонков — ТОЛЬКО сервисы: без контроллера
 * и без снапшот-крона. Для программного использования из других
 * приложений (kpi-report-sales: пульс / повестка / дайджест через
 * CallReportAnalyticsDataService.loadLite), которым нельзя светить
 * endpoints /call-report/analytics/* в своём Swagger (правило
 * ai/rules/app-api-surface.md).
 *
 * Зависимости — БД (transcriptions/ais через store-сервисы) и Redis;
 * PortalStoreModule ядру не нужен — он только для крона снапшотов в
 * CallReportAnalyticsModule.
 */
@Module({
    imports: [ConfigModule, RedisModule, AiModule, TranscriptionStoreModule],
    providers: [
        CallReportAnalyticsDataService,
        CallReportAnalyticsAggregatorService,
        CallReportAnalyticsCacheService,
        CallReportAnalyticsHistoryService,
        CallReportAnalyticsService,
    ],
    exports: [
        CallReportAnalyticsDataService,
        CallReportAnalyticsAggregatorService,
        CallReportAnalyticsCacheService,
        CallReportAnalyticsHistoryService,
        CallReportAnalyticsService,
    ],
})
export class CallReportAnalyticsCoreModule {}
