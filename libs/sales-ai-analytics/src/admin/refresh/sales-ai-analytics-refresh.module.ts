import { Module } from '@nestjs/common';
import { RedisModule } from '@lib/core/redis/redis.module';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings';
import { QueueModule } from '@lib/queue';
import { SalesAiAnalyticsLaunchModule } from '../launch/sales-ai-analytics-launch.module';
import { SalesAiAnalyticsOpsModule } from '../sales-ai-analytics-ops.module';
import { AiRefreshProcessor } from './ai-analytics-refresh.processor';
import { AiAnalyticsRefreshService } from './ai-analytics-refresh.service';
import { AiRefreshTickUseCase } from './refresh-tick.use-case';
import { AiRefreshStore } from './refresh.store';
import { AiRefreshCacheStep } from './steps/cache.step';
import { AiRefreshForecastStep } from './steps/forecast.step';
import { AiRefreshOwnerReportStep } from './steps/owner-report.step';
import { AiRefreshReanalyzeStep } from './steps/reanalyze.step';
import { AiRefreshRebuildStep } from './steps/rebuild.step';
import {
    AI_REFRESH_STEP_HANDLERS,
    type AiRefreshStepHandler,
} from './steps/refresh-step.types';

/**
 * «Обновить всё по порядку» (08.11.2026): сервисы сценария, шаги и воркер
 * тиков очереди AI_ANALYTICS_ADMIN. Без контроллеров — их подключает
 * `SalesAiAnalyticsAdminModule`. Подключать ТОЛЬКО в apps/admin: воркер
 * этой очереди должен быть один (ai/rules/app-api-surface.md).
 */
@Module({
    imports: [
        RedisModule,
        QueueModule,
        PortalAppSettingsModule,
        SalesAiAnalyticsOpsModule,
        SalesAiAnalyticsLaunchModule,
    ],
    providers: [
        AiRefreshStore,
        AiRefreshReanalyzeStep,
        AiRefreshRebuildStep,
        AiRefreshCacheStep,
        AiRefreshForecastStep,
        AiRefreshOwnerReportStep,
        {
            provide: AI_REFRESH_STEP_HANDLERS,
            useFactory: (
                ...handlers: AiRefreshStepHandler[]
            ): AiRefreshStepHandler[] => handlers,
            inject: [
                AiRefreshReanalyzeStep,
                AiRefreshRebuildStep,
                AiRefreshCacheStep,
                AiRefreshForecastStep,
                AiRefreshOwnerReportStep,
            ],
        },
        AiRefreshTickUseCase,
        AiAnalyticsRefreshService,
        AiRefreshProcessor,
    ],
    exports: [AiAnalyticsRefreshService],
})
export class SalesAiAnalyticsRefreshModule {}
