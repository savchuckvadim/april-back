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

// Фаза 2, сборка (поток 19): ядро общих провайдеров (без Битрикса и его
// PBX-половина), модули срезов со своими шагами и готовый динамический
// модуль конвейера с полным порядком одиннадцати шагов
// (AiAnalyticsPipelineModule.registerPhase2()).
export {
    AI_ANALYTICS_CORE_PROVIDERS,
    AiAnalyticsCoreModule,
} from './core/ai-analytics-core.module';
export {
    AI_ANALYTICS_CORE_PBX_PROVIDERS,
    AiAnalyticsCorePbxModule,
} from './core/ai-analytics-core-pbx.module';
export {
    AI_ANALYTICS_PIPELINE_STEP_MODULES,
    AI_ANALYTICS_PIPELINE_STEP_ORDER,
    AiAnalyticsPipelineModule,
} from './pipeline/ai-analytics-pipeline.module';
export type { AiAnalyticsPipelineOptions } from './pipeline/ai-analytics-pipeline.module';
export { AiAnalyticsSnapshotsModule } from './snapshots/ai-analytics-snapshots.module';
export { AiAnalyticsPassportModule } from './passport/ai-analytics-passport.module';
export { AiAnalyticsStageHistoryModule } from './stage-history/ai-analytics-stage-history.module';
export { AiAnalyticsPortalModelModule } from './portal-model/ai-analytics-portal-model.module';
export { PortalModelUseCase } from './domain/use-cases/portal-model.use-case';

// Срезы ручек Фазы 2: у каждого один контроллер под тегом «Sales AI
// Analytics» (plan/daily, brief, manager/style, rop-mark/pick|list|save) —
// поверхность API приложения растёт ровно на них.
export { AiAnalyticsPlanModule } from './plan/ai-analytics-plan.module';
export { DailyPlanUseCase } from './domain/use-cases/daily-plan.use-case';
export { AiAnalyticsBriefModule } from './brief/ai-analytics-brief.module';
export { BriefUseCase } from './domain/use-cases/brief.use-case';
export { BriefJobUseCase } from './domain/use-cases/brief-job.use-case';
export type {
    AiBriefCacheEntry,
    AiBriefJobData,
    AiBriefWsDonePayload,
    AiBriefWsErrorPayload,
} from './dto/ai-brief.dto';
export { AiAnalyticsStyleModule } from './style/ai-analytics-style.module';
export { StyleProfileUseCase } from './style/style-profile.use-case';
export { AiAnalyticsRopMarkModule } from './rop-mark/ai-analytics-rop-mark.module';
export { RopMarkUseCase } from './domain/use-cases/rop-mark.use-case';
export {
    AI_ROP_MARK_ROUTES,
    buildRopMarkKey,
} from './ai-analytics-rop-mark.controller';
// Единый порог длительности разбора (реестр + определения портала):
// шаги конвейера обязаны фильтровать звонки той же функцией, что и пульс.
export { portalMinDurationByType } from './domain/loaders/min-duration.util';
// Блок «Как считаем»: генерируется из реестра и снапшота модели портала
// (поток 19); фронт рендерит его в диалоге AiHowWeCountDialog.
export { AiAnalyticsAboutModule } from './about/ai-analytics-about.module';
export { buildAiAnalyticsAbout } from './about/ai-analytics-about.builder';
export {
    AI_ABOUT_ENDPOINTS,
    AI_ABOUT_ROUTE,
} from './about/ai-analytics-about.const';
export type { AiAboutEndpoint } from './about/ai-analytics-about.const';
export type { AiAboutDto, AiAboutResponseDto } from './dto/ai-about.dto';
