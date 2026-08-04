import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '@lib/core/redis/redis.module';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { AiModule } from '../ai/ai.module';
import { TranscriptionStoreModule } from '../transcription/transcription-store.module';
import { CallReportAnalyticsController } from './controllers/call-report-analytics.controller';
import { CallReportAnalyticsService } from './call-report-analytics.service';
import { CallReportAnalyticsSnapshotScheduler } from './call-report-analytics-snapshot.scheduler';
import { CallReportAnalyticsDataService } from './services/call-report-analytics-data.service';
import { CallReportAnalyticsAggregatorService } from './services/call-report-analytics-aggregator.service';
import { CallReportAnalyticsCacheService } from './services/call-report-analytics-cache.service';
import { CallReportAnalyticsHistoryService } from './services/call-report-analytics-history.service';

/**
 * Отчёты по AI-аналитике звонков — переносимый модуль (единая точка входа).
 *
 * Подключение в любой app одним импортом:
 *   imports: [CallReportAnalyticsModule]
 * — приезжают endpoints /call-report/analytics/* и программный фасад
 * CallReportAnalyticsService (экспортируется).
 *
 * Зависимости — только БД (transcriptions/ais через store-сервисы) и Redis;
 * Bitrix/LLM модулю не нужны: отчёты строятся из уже накопленных данных.
 * Подробности и контракт — в README.md рядом.
 */
@Module({
    imports: [
        ConfigModule,
        RedisModule,
        AiModule,
        TranscriptionStoreModule,
        // Снапшот-крон идёт по включённым порталам portal_ai_settings
        PortalStoreModule,
    ],
    controllers: [CallReportAnalyticsController],
    providers: [
        CallReportAnalyticsService,
        CallReportAnalyticsDataService,
        CallReportAnalyticsAggregatorService,
        CallReportAnalyticsCacheService,
        CallReportAnalyticsHistoryService,
        // Weekly-снапшоты профилей порталов (по включённым порталам БД,
        // требует ScheduleModule.forRoot в app-потребителе)
        CallReportAnalyticsSnapshotScheduler,
    ],
    exports: [CallReportAnalyticsService],
})
export class CallReportAnalyticsModule {}
