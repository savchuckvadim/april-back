import { Module } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { QueueModule } from 'src/modules/queue/queue.module';
import { WsModule } from '@/core/ws/ws.module';
import { PortalSessionModule } from '@lib/auth';
import { LlmGatewayModule } from '@lib/llm-gateway';
import { AiAnalyticsCorePbxModule } from '../core/ai-analytics-core-pbx.module';
import { AiAnalyticsCoreModule } from '../core/ai-analytics-core.module';
import { OwnerReportScheduler } from '../cron/owner-report.scheduler';
import { OwnerReportDeliveryUseCase } from '../domain/use-cases/owner-report-delivery.use-case';
import { OwnerReportJobUseCase } from '../domain/use-cases/owner-report-job.use-case';
import { OwnerReportUseCase } from '../domain/use-cases/owner-report.use-case';
import { AiAnalyticsOwnerReportController } from './ai-analytics-owner-report.controller';
import { OwnerReportPdfService } from './owner-report-pdf.service';
import { LlmGatewayNarrativeAdapter } from './llm-gateway-narrative.adapter';
import { AI_OWNER_REPORT_NARRATIVE_PORT } from './owner-report-narrative.port';
import { OwnerReportSnapshotReader } from './owner-report-snapshot.reader';
import { OwnerReportSourcesLoader } from './owner-report-sources.loader';

/**
 * Срез «Отчёт собственнику за период» (постановка
 * ai/tasks/2026-11-06-owner-period-report.md): ручка, источники, джоба,
 * модель через шлюз LLM. Ядро и PBX-половина ядра — из общих модулей;
 * текст и факты — чистые функции @lib/sales-ai-analytics.
 */
@Module({
    imports: [
        QueueModule,
        WsModule,
        PBXModule,
        LlmGatewayModule,
        AiAnalyticsCoreModule,
        AiAnalyticsCorePbxModule,
        PortalSessionModule,
    ],
    controllers: [AiAnalyticsOwnerReportController],
    providers: [
        OwnerReportSourcesLoader,
        OwnerReportSnapshotReader,
        OwnerReportPdfService,
        LlmGatewayNarrativeAdapter,
        {
            provide: AI_OWNER_REPORT_NARRATIVE_PORT,
            useExisting: LlmGatewayNarrativeAdapter,
        },
        OwnerReportUseCase,
        OwnerReportJobUseCase,
        OwnerReportDeliveryUseCase,
        OwnerReportScheduler,
    ],
    // Джобы нужны процессору очереди (поток сборки), конверт ручки —
    // соседним срезам.
    exports: [
        OwnerReportUseCase,
        OwnerReportJobUseCase,
        OwnerReportDeliveryUseCase,
    ],
})
export class AiAnalyticsOwnerReportModule {}
