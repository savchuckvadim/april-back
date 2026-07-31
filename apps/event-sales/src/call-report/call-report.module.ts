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
import { AiRagModule } from '@lib/ai-rag';
import { BxDepartmentModule } from 'libs/bx-department';
import { AgentGateModule } from '../agent-gate/agent-gate.module';
import { CallReportController } from './controllers/call-report.controller';
import { CallClassifyInstructionService } from './services/call-classify-instruction.service';
import { CallClassifyStepService } from './services/call-classify-step.service';
import { CallDeepAnalysisService } from './services/call-deep-analysis.service';
import { CallReportAnalyzeUseCase } from './use-cases/call-report-analyze.use-case';
import { CallReportPipelineUseCase } from './use-cases/call-report-pipeline.use-case';
import { CallReportScanUseCase } from './use-cases/call-report-scan.use-case';
import { CallReportProcessor } from './queue/call-report.processor';
import { CallReportScheduler } from './cron/call-report.scheduler';

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
        // Отчёты по накопленной аналитике: /call-report/analytics/*
        // (переносимый модуль, см. его README)
        CallReportAnalyticsModule,
        // Реестр типов звонков (встроенные + общие/клиентские из базы знаний)
        CallTypeRegistryModule,
        // Фильтр сканера «только менеджеры отдела продаж»
        BxDepartmentModule,
        // Запись глубокого разбора (ais + смарт + таймлайн) —
        // AgentAnalysisIntakeService. Внешнего агента больше нет: разбор
        // считает CallDeepAnalysisService здесь же, а приём переиспользуем.
        AgentGateModule,
    ],
    controllers: [CallReportController],
    providers: [
        CallClassifyInstructionService,
        CallClassifyStepService,
        CallDeepAnalysisService,
        CallReportAnalyzeUseCase,
        CallReportPipelineUseCase,
        CallReportScanUseCase,
        CallReportProcessor,
        CallReportScheduler,
    ],
})
export class CallReportModule {}
