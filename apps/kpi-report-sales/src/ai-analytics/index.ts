export { AiAnalyticsModule } from './ai-analytics.module';
export { AiAnalyticsCacheService } from './cache/ai-analytics-cache.service';
export { PulseUseCase } from './domain/use-cases/pulse.use-case';
export { AgendaUseCase } from './domain/use-cases/agenda.use-case';
export { MorningDigestUseCase } from './domain/use-cases/morning-digest.use-case';
export { AiAnalyticsFeedbackStore } from './store/ai-analytics-feedback.store';
export { AiAnalyticsPushUseCase } from './domain/use-cases/push.use-case';
export type { AiPushInput, AiPushResult } from './domain/use-cases/push.types';
export { AiAnalyticsDeliveryService } from './delivery/ai-analytics-delivery.service';
export { AiAnalyticsPushLogStore } from './store/ai-analytics-push-log.store';
export { buildPushJobId } from './cron/ai-analytics-push.scheduler';
export { buildSnapshotJobId } from './cron/ai-analytics-audit.scheduler';
export { AuditSnapshotUseCase } from './domain/use-cases/audit-snapshot.use-case';
export type {
    AiSnapshotJobData,
    AiAuditSnapshotResult,
} from './dto/ai-snapshot.dto';
export { OverviewUseCase } from './domain/use-cases/overview.use-case';
export type { OverviewInput } from './domain/use-cases/overview.use-case';
export { OverviewLookupUseCase } from './domain/use-cases/overview-lookup.use-case';
export type {
    OverviewLookup,
    OverviewKeyRef,
} from './domain/use-cases/overview-lookup.use-case';
export type { AiOverviewJobData } from './dto/ai-overview-request.dto';
export type {
    AiOverviewCacheEntry,
    AiOverviewWsDonePayload,
    AiOverviewWsErrorPayload,
} from './dto/ai-overview.dto';

// Фаза 2, волна 4 «сборка конвейера»: модули срезов со своими шагами и
// готовый динамический модуль конвейера с полным порядком шагов
// (AiAnalyticsPipelineModule.registerPhase2()). Контроллеров у срезов нет —
// поверхность API приложения от них не растёт.
export {
    AI_ANALYTICS_PIPELINE_STEP_MODULES,
    AI_ANALYTICS_PIPELINE_STEP_ORDER,
    AiAnalyticsPipelineModule,
} from './pipeline/ai-analytics-pipeline.module';
export type { AiAnalyticsPipelineOptions } from './pipeline/ai-analytics-pipeline.module';
export { AiAnalyticsSnapshotsModule } from './snapshots/ai-analytics-snapshots.module';
export { AiAnalyticsPassportModule } from './passport/ai-analytics-passport.module';
export { AiAnalyticsStageHistoryModule } from './stage-history/ai-analytics-stage-history.module';
export { AiAnalyticsRopMarkModule } from './rop-mark/ai-analytics-rop-mark.module';
export { RopMarkUseCase } from './domain/use-cases/rop-mark.use-case';
// Единый порог длительности разбора (реестр + определения портала):
// шаги конвейера обязаны фильтровать звонки той же функцией, что и пульс.
export { portalMinDurationByType } from './domain/use-cases/pulse.use-case';
