import { Module } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { QueueModule } from 'src/modules/queue/queue.module';
import { WsModule } from '@/core/ws/ws.module';
import { AiModule } from '@lib/call-lib';
import { PortalSessionModule } from '@lib/auth';
import { BxDepartmentModule } from '@lib/bx-department';
import { PbxAicallSmartModule } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { SalesAiAnalyticsAuditModule } from '@lib/sales-ai-analytics';
import { AiAnalyticsAboutModule } from './about/ai-analytics-about.module';
import { AiAnalyticsOverviewController } from './ai-analytics-overview.controller';
import { AiAnalyticsController } from './ai-analytics.controller';
import { AiAnalyticsBriefModule } from './brief/ai-analytics-brief.module';
import { AiAnalyticsCorePbxModule } from './core/ai-analytics-core-pbx.module';
import { AiAnalyticsCoreModule } from './core/ai-analytics-core.module';
import { AiAnalyticsAuditScheduler } from './cron/ai-analytics-audit.scheduler';
import { AiAnalyticsOverviewPrewarmScheduler } from './cron/ai-analytics-overview-prewarm.scheduler';
import { AiAnalyticsPushScheduler } from './cron/ai-analytics-push.scheduler';
import { ManagerOrgLoader } from './domain/loaders/manager-org.loader';
import { AgendaUseCase } from './domain/use-cases/agenda.use-case';
import { AttentionUseCase } from './domain/use-cases/attention.use-case';
import { AuditSnapshotUseCase } from './domain/use-cases/audit-snapshot.use-case';
import { ByTypeUseCase } from './domain/use-cases/by-type.use-case';
import { FeedbackUseCase } from './domain/use-cases/feedback.use-case';
import { MorningDigestUseCase } from './domain/use-cases/morning-digest.use-case';
import { OverviewJobUseCase } from './domain/use-cases/overview-job.use-case';
import { OverviewLookupUseCase } from './domain/use-cases/overview-lookup.use-case';
import { OverviewUseCase } from './domain/use-cases/overview.use-case';
import { PulseUseCase } from './domain/use-cases/pulse.use-case';
import { PushAgendaUseCase } from './domain/use-cases/push-agenda.use-case';
import { PushDigestAllUseCase } from './domain/use-cases/push-digest-all.use-case';
import { PushDigestUseCase } from './domain/use-cases/push-digest.use-case';
import { AiAnalyticsPushUseCase } from './domain/use-cases/push.use-case';
import { SettingsSaveUseCase } from './domain/use-cases/settings-save.use-case';
import { SettingsUseCase } from './domain/use-cases/settings.use-case';
import { AiAnalyticsPipelineModule } from './pipeline/ai-analytics-pipeline.module';
import { AiAnalyticsPlanModule } from './plan/ai-analytics-plan.module';
import { AiAnalyticsQueueProcessor } from './queue/ai-analytics.processor';
import { AiAnalyticsRopMarkModule } from './rop-mark/ai-analytics-rop-mark.module';
import { AiAnalyticsFeedbackStore } from './store/ai-analytics-feedback.store';
import { AiAnalyticsPushLogStore } from './store/ai-analytics-push-log.store';
import { AiAnalyticsSettingsAuditStore } from './store/ai-analytics-settings-audit.store';
import { AiAnalyticsStyleModule } from './style/ai-analytics-style.module';

/**
 * AI-аналитика отдела продаж — сборка фичи (планы
 * ai/tasks/ai-sales-analytics-plan.md и ai-sales-analytics-phase2-plan.md,
 * поток 19 «p2-wiring»). Тег Swagger «Sales AI Analytics», префикс
 * `ai-analytics`; состав и контракты — в README модуля.
 *
 * Устройство (правило владения общими файлами §1.6 п. 2): каждый срез
 * Фазы 2 объявляет собственный @Module, здесь они только импортируются —
 * корневой модуль остаётся коротким, а потоки не конфликтуют за один файл.
 *
 * - `core/` — ядро общих провайдеров без состояния (кэш, настройки,
 *   параметры реестра, ростер, порталы, разборы, стор снапшотов, периметр)
 *   и его PBX-половина (KPI, финансы, планы руководителя, стор настроек).
 *   Каждый объявлен один раз; здесь и в срезах — только импорт ядра.
 * - `AiAnalyticsPipelineModule.registerPhase2()` — ночной конвейер: все
 *   модули срезов шагов (снапшоты, паспорт и планы, история стадий, три
 *   звонка недели, модель портала и прогноз) и массив
 *   AI_ANALYTICS_PIPELINE_STEPS в порядке AI_ANALYTICS_PIPELINE_STEP_ORDER;
 *   раннер отдаётся процессору по токену AI_ANALYTICS_SNAPSHOT_RUNNER.
 * - Срезы ручек: план дня (`plan/daily`), AI-резюме (`brief`, очередь +
 *   WS + кэш; джобу выполняет процессор через BriefJobUseCase из среза),
 *   карточка стиля (`manager/style`), слепая проверка руководителя
 *   (`rop-mark/pick|list|save`), блок «Как считаем» (`about`) из реестра
 *   параметров и снапшота модели портала.
 *
 * Собственные провайдеры модуля — контур Фазы 1: ручки настроек, пульса,
 * повестки, обратной связи и обзора менеджер × тип (очередь + WS + кэш,
 * прогрев 05:30 МСК), push-контур (крон → джобы SALES_AI_ANALYTICS_PUSH →
 * тот же процессор → AiAnalyticsPushUseCase; доставка — non-injectable
 * AiAnalyticsDeliveryService(bitrix)) и месячный снапшот аудита данных
 * Фазы 0 (AiAnalyticsAuditScheduler → AuditSnapshotUseCase →
 * AiAnalyticsAuditService из сервисного SalesAiAnalyticsAuditModule).
 *
 * Импорты — только сервисные модули без контроллеров
 * (ai/rules/app-api-surface.md): PBXModule (push и обзор ходят в портал),
 * QueueModule/WsModule, AiModule (ais-записи обратной связи и аудита
 * настроек), PbxAicallSmartModule (entityTypeId смарта для ссылок на
 * разборы), SalesAiAnalyticsAuditModule (ручки аудита — в apps/admin).
 * BxDepartmentModule публикует роуты структуры, которые приложение
 * подключает и само. Контроллеров в поверхности приложения ровно семь:
 * два здесь и по одному у срезов плана, резюме, стиля, проверки и блока
 * «Как считаем» — закреплено `__tests__/ai-analytics-module-di.spec.ts`.
 *
 * Все провайдеры — @Injectable без bitrix-состояния (см. CLAUDE.md про
 * race condition c this.bitrix): портал приходит параметром domain.
 */
@Module({
    imports: [
        PBXModule,
        QueueModule,
        WsModule,
        AiModule,
        BxDepartmentModule,
        PbxAicallSmartModule,
        PortalSessionModule,
        SalesAiAnalyticsAuditModule,
        AiAnalyticsCoreModule,
        AiAnalyticsCorePbxModule,
        AiAnalyticsPipelineModule.registerPhase2(),
        AiAnalyticsPlanModule,
        AiAnalyticsBriefModule,
        AiAnalyticsStyleModule,
        AiAnalyticsRopMarkModule,
        AiAnalyticsAboutModule,
    ],
    controllers: [AiAnalyticsController, AiAnalyticsOverviewController],
    providers: [
        ManagerOrgLoader,
        AiAnalyticsFeedbackStore,
        AiAnalyticsSettingsAuditStore,
        AiAnalyticsPushLogStore,
        SettingsUseCase,
        PulseUseCase,
        AgendaUseCase,
        MorningDigestUseCase,
        FeedbackUseCase,
        PushAgendaUseCase,
        PushDigestUseCase,
        PushDigestAllUseCase,
        AiAnalyticsPushUseCase,
        AiAnalyticsPushScheduler,
        AuditSnapshotUseCase,
        AiAnalyticsAuditScheduler,
        OverviewUseCase,
        OverviewLookupUseCase,
        OverviewJobUseCase,
        AttentionUseCase,
        ByTypeUseCase,
        SettingsSaveUseCase,
        AiAnalyticsOverviewPrewarmScheduler,
        AiAnalyticsQueueProcessor,
    ],
    // Ядро (кэш, стор снапшотов, параметры реестра и остальные общие
    // провайдеры), use-case'ы и push экспортируются для инвалидации и
    // запуска рассылки из соседних модулей приложения.
    exports: [
        AiAnalyticsCoreModule,
        PulseUseCase,
        AgendaUseCase,
        MorningDigestUseCase,
        AiAnalyticsFeedbackStore,
        AiAnalyticsPushUseCase,
        OverviewUseCase,
        OverviewLookupUseCase,
    ],
})
export class AiAnalyticsModule {}
