import { Module } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { QueueModule } from 'src/modules/queue/queue.module';
import { WsModule } from '@/core/ws/ws.module';
import { AiModule, CallReportAnalyticsCoreModule } from '@lib/call-lib';
import { BxDepartmentModule } from '@lib/bx-department';
import { PbxAicallSmartModule } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings';
import { SalesAiAnalyticsAuditModule } from '@lib/sales-ai-analytics';
import { AiAnalyticsController } from './ai-analytics.controller';
import { AiAnalyticsCacheService } from './cache/ai-analytics-cache.service';
import { AiAnalyticsAuditScheduler } from './cron/ai-analytics-audit.scheduler';
import { AiAnalyticsPushScheduler } from './cron/ai-analytics-push.scheduler';
import { RequesterAccessService } from './domain/access/requester-access.service';
import { CallsLoader } from './domain/loaders/calls.loader';
import { FinanceLoader } from './domain/loaders/finance.loader';
import { KpiLoader } from './domain/loaders/kpi.loader';
import { ManagersLoader } from './domain/loaders/managers.loader';
import { PlansLoader } from './domain/loaders/plans.loader';
import { AiAnalyticsPortalsLoader } from './domain/loaders/portals.loader';
import { SalesFinanceUseCaseFactory } from './domain/loaders/sales-finance-use-case.factory';
import { SettingsLoader } from './domain/loaders/settings.loader';
import { SmartLinkLoader } from './domain/loaders/smart-link.loader';
import { AgendaUseCase } from './domain/use-cases/agenda.use-case';
import { AuditSnapshotUseCase } from './domain/use-cases/audit-snapshot.use-case';
import { FeedbackUseCase } from './domain/use-cases/feedback.use-case';
import { MorningDigestUseCase } from './domain/use-cases/morning-digest.use-case';
import { PulseUseCase } from './domain/use-cases/pulse.use-case';
import { PushAgendaUseCase } from './domain/use-cases/push-agenda.use-case';
import { PushDigestUseCase } from './domain/use-cases/push-digest.use-case';
import { AiAnalyticsPushUseCase } from './domain/use-cases/push.use-case';
import { SettingsUseCase } from './domain/use-cases/settings.use-case';
import { AiAnalyticsQueueProcessor } from './queue/ai-analytics.processor';
import { AiAnalyticsFeedbackStore } from './store/ai-analytics-feedback.store';
import { AiAnalyticsPushLogStore } from './store/ai-analytics-push-log.store';

/**
 * AI-аналитика отдела продаж (Фаза 1a плана ai/tasks/ai-sales-analytics-plan.md).
 *
 * Импорты — только сервисные модули без контроллеров (правило
 * app-api-surface: чужие роуты не должны утечь в Swagger kpi-report-sales):
 * CallReportAnalyticsCoreModule (loadLite, без контроллера аналитики
 * event-sales), PortalAppSettingsModule (resolve настроек kpiSales),
 * AiModule (ais-записи обратной связи), PbxAicallSmartModule (entityTypeId
 * смарта для ссылок на разборы). BxDepartmentModule (права по структуре)
 * и QueueModule/WsModule уже подключены в приложении. AppCacheService —
 * глобальный (AppCacheModule в корне).
 *
 * Все провайдеры — @Injectable без bitrix-состояния (см. CLAUDE.md про
 * race condition c this.bitrix): портал приходит параметром domain.
 *
 * Push-контур (шаг 2): AiAnalyticsPushScheduler (крон → джобы
 * SALES_AI_ANALYTICS_PUSH в SALES_KPI_REPORT), AiAnalyticsQueueProcessor
 * (воркер) и AiAnalyticsPushUseCase (общий код крона и ручки push);
 * доставка — non-injectable AiAnalyticsDeliveryService(bitrix).
 *
 * Снапшот аудита данных (Фаза 0): AiAnalyticsAuditScheduler (1-го числа
 * 04:10 МСК → джобы SALES_AI_ANALYTICS_SNAPSHOT) → тот же процессор →
 * AuditSnapshotUseCase → AiAnalyticsAuditService из сервисного
 * SalesAiAnalyticsAuditModule (lib; без контроллеров — ручки живут в
 * SalesAiAnalyticsAdminModule и подключаются только в apps/admin).
 *
 * KPI-слой (Фаза 1b, шаг 1): ManagersLoader (ростер ОП по BxDepartment),
 * KpiLoader (kpi-report + per-type батч, помесячный кэш), FinanceLoader
 * (закрытые продажи и пайплайн через use-case'ы sales-finance, созданные
 * SalesFinanceUseCaseFactory поверх глобального AppCache — SalesFinanceModule
 * с контроллером не импортируется), PlansLoader (планы руководителя).
 * Новых imports не нужно: PBXModule и BxDepartmentModule уже подключены.
 */
@Module({
    imports: [
        PBXModule,
        QueueModule,
        WsModule,
        CallReportAnalyticsCoreModule,
        PortalAppSettingsModule,
        AiModule,
        BxDepartmentModule,
        PbxAicallSmartModule,
        SalesAiAnalyticsAuditModule,
    ],
    controllers: [AiAnalyticsController],
    providers: [
        AiAnalyticsCacheService,
        RequesterAccessService,
        CallsLoader,
        AiAnalyticsPortalsLoader,
        SettingsLoader,
        SmartLinkLoader,
        ManagersLoader,
        KpiLoader,
        SalesFinanceUseCaseFactory,
        FinanceLoader,
        PlansLoader,
        AiAnalyticsFeedbackStore,
        SettingsUseCase,
        PulseUseCase,
        AgendaUseCase,
        MorningDigestUseCase,
        FeedbackUseCase,
        AiAnalyticsPushLogStore,
        PushAgendaUseCase,
        PushDigestUseCase,
        AiAnalyticsPushUseCase,
        AiAnalyticsPushScheduler,
        AuditSnapshotUseCase,
        AiAnalyticsAuditScheduler,
        AiAnalyticsQueueProcessor,
    ],
    // Кэш, use-case'ы и push экспортируются для инвалидации и запуска
    // рассылки из соседних модулей.
    exports: [
        AiAnalyticsCacheService,
        PulseUseCase,
        AgendaUseCase,
        MorningDigestUseCase,
        AiAnalyticsFeedbackStore,
        AiAnalyticsPushUseCase,
    ],
})
export class AiAnalyticsModule {}
