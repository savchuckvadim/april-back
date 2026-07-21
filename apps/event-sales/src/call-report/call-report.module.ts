import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PBXModule } from '@lib/pbx/pbx.module';
import { RedisModule } from '@lib/core/redis/redis.module';
import { QueueModule } from '@lib/queue/queue.module';
import {
    TranscriptionModule,
    TranscriptionProviderModule,
    AiModule,
} from '@lib/call-lib';
import { AiRagModule } from '@lib/ai-rag';
import { BxDepartmentModule } from 'libs/bx-department';
import { CallReportController } from './controllers/call-report.controller';
import { CallReportSmartResolverService } from './services/call-report-smart-resolver.service';
import { InstallCallReportSmartUseCase } from './use-cases/install-call-report-smart.use-case';
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
 * Смарт-процесс-витрина устанавливается отсюда (install-smart), но
 * элементы в него пишет agent-gate при push-back внешнего агента.
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
        // Фильтр сканера «только менеджеры отдела продаж»
        BxDepartmentModule,
    ],
    controllers: [CallReportController],
    providers: [
        CallReportSmartResolverService,
        InstallCallReportSmartUseCase,
        CallReportPipelineUseCase,
        CallReportScanUseCase,
        CallReportProcessor,
        CallReportScheduler,
    ],
    exports: [CallReportSmartResolverService],
})
export class CallReportModule {}
