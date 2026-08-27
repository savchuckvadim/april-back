import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PBXModule } from '@lib/pbx/pbx.module';
import { RedisModule } from '@lib/core/redis/redis.module';
import { QueueModule } from '@lib/queue/queue.module';
import {
    TranscriptionModule,
    TranscriptionProviderModule,
    AiModule,
    CallReportAnalyticsModule,
    CallReportSmartModule,
    CallTypeRegistryModule,
} from '@lib/call-lib';
import { CallReportWeeklyModule } from '@lib/call-lib/call-report/weekly-report/call-report-weekly.module';
import { AiRagModule } from '@lib/ai-rag';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings';
import { BxDepartmentModule } from 'libs/bx-department';
import { AgentGateModule } from '../agent-gate/agent-gate.module';
import { CallReportController } from './controllers/call-report.controller';
import { CallClassifyInstructionService } from './services/call-classify-instruction.service';
import { CallClassifyStepService } from './services/call-classify-step.service';
import { CallContextBuilderService } from './services/call-context-builder.service';
import { CallDeepAnalysisService } from './services/call-deep-analysis.service';
import { CallFocusAnalysisService } from './services/call-focus-analysis.service';
import { CallReportSettingsService } from './services/call-report-settings.service';
import { CallRevisionService } from './services/call-revision.service';
import { PresentationAuditService } from './services/presentation-audit.service';
import { PresentationPlanFactService } from './services/presentation-plan-fact.service';
import { CallReportAnalyzeUseCase } from './use-cases/call-report-analyze.use-case';
import { CallReportPipelineUseCase } from './use-cases/call-report-pipeline.use-case';
import { CallReportScanUseCase } from './use-cases/call-report-scan.use-case';
import { CallReportProcessor } from './queue/call-report.processor';
import { CallReportDomainRosterService } from './cron/call-report-domain-roster.service';
import { CallReportScheduler } from './cron/call-report.scheduler';
import { CallReportCatchUpScheduler } from './cron/call-report-catch-up.scheduler';
import { CallReportWeeklyScheduler } from './cron/call-report-weekly.scheduler';
import { CallRevisionScheduler } from './cron/call-revision.scheduler';
import { PresentationAuditScheduler } from './cron/presentation-audit.scheduler';

/**
 * AI-отчётность по звонкам (внутренний контур):
 * cron-сканер voximplant → очередь CALL_REPORT → транскрибация
 * (Yandex/Vibecode по длительности) → GigaChat RAG → персист в
 * transcriptions/ais → резюме в таймлайн сделки.
 *
 * Смарт-подсистема (конфиг/installer/resolver/writer) — переиспользуемый
 * CallReportSmartModule из @lib/call-lib: этот app даёт контроллер
 * /call-report/install-smart, admin — свой /admin/pbx/smarts/install-aicall.
 */
@Module({
    imports: [
        ConfigModule,
        PBXModule,
        RedisModule,
        QueueModule,
        TranscriptionModule,
        TranscriptionProviderModule,
        AiModule,
        AiRagModule,
        CallReportSmartModule,
        // Недельный Excel-отчёт: всё, что не помещается в карточку смарта
        CallReportWeeklyModule,
        // Отчёты по накопленной аналитике: /call-report/analytics/*
        // (переносимый модуль, см. его README)
        CallReportAnalyticsModule,
        // Реестр типов звонков (встроенные + общие/клиентские из базы знаний)
        CallTypeRegistryModule,
        // Фильтр сканера «только менеджеры отдела продаж»
        BxDepartmentModule,
        // Настройки AI на портал: пороги, модели и расписание берутся из БД,
        // а незаданные значения падают в глобальные env (см.
        // CallReportSettingsService)
        PortalStoreModule,
        // App-настройки event-sales: withCheckPresentation («5К и хвост»)
        // ужесточает разбор презентационных звонков
        PortalAppSettingsModule,
        // Запись глубокого разбора (ais + смарт + таймлайн) —
        // AgentAnalysisIntakeService. Внешнего агента больше нет: разбор
        // считает CallDeepAnalysisService здесь же, а приём переиспользуем.
        AgentGateModule,
    ],
    controllers: [CallReportController],
    providers: [
        CallClassifyInstructionService,
        CallClassifyStepService,
        CallContextBuilderService,
        CallDeepAnalysisService,
        CallFocusAnalysisService,
        CallReportSettingsService,
        CallRevisionService,
        CallReportAnalyzeUseCase,
        CallReportPipelineUseCase,
        CallReportScanUseCase,
        CallReportProcessor,
        CallReportDomainRosterService,
        CallReportScheduler,
        CallReportCatchUpScheduler,
        // Недельный Excel-отчёт получателям (пятница 19:00 МСК)
        CallReportWeeklyScheduler,
        // Ночной ревизор (Фаза 3): свод по сущностям в 23:30 МСК
        CallRevisionScheduler,
        // Сверка по презентациям (Фаза 4): отчёт менеджера vs разбор, 08:00 МСК
        PresentationAuditService,
        PresentationAuditScheduler,
        // План-факт: запланированные презентации КПИ vs звонки-презентации
        PresentationPlanFactService,
    ],
})
export class CallReportModule {}
