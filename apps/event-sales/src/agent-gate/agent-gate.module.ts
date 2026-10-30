import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PBXModule } from '@lib/pbx/pbx.module';
import {
    TranscriptionModule,
    AiModule,
    CallReportSmartModule,
    CallTypeRegistryModule,
} from '@lib/call-lib';
import { AiRagModule } from '@lib/ai-rag';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings';
import { AgentKeyGuard } from './guards/agent-key.guard';
import { AgentCallsController } from './controllers/agent-calls.controller';
import { AgentKnowledgeController } from './controllers/agent-knowledge.controller';
import { AgentBitrixContextService } from './services/agent-bitrix-context.service';
import { AgentCallPackageService } from './services/agent-call-package.service';
import { AgentAnalysisIntakeService } from './services/agent-analysis-intake.service';
import { AgentAnalysisSmartRewriteService } from './services/agent-analysis-smart-rewrite.service';
import { LlmPriceResolverService } from './services/llm-price-resolver.service';

/**
 * Agent API (внешний контур AI-отчётности): шлюз данных для удалённого
 * агента-аналитика (OpenClaw / claude-code) — выдача звонков с контекстом,
 * RAG-материалов по типам звонков и приём push-back результатов с записью
 * в смарт-процесс «AI-анализ звонков». Доступ по ключам AGENT_API_KEYS.
 */
@Module({
    imports: [
        ConfigModule,
        PBXModule,
        TranscriptionModule,
        AiModule,
        AiRagModule,
        CallReportSmartModule,
        // Реестр типов звонков — профили в пакете агента
        CallTypeRegistryModule,
        // Настройки kpiSales: цена 1 000 токенов портала (llm_price_per_1k)
        // для колонок расхода ais при приёме разбора
        PortalAppSettingsModule,
    ],
    controllers: [AgentCallsController, AgentKnowledgeController],
    providers: [
        AgentKeyGuard,
        AgentBitrixContextService,
        AgentCallPackageService,
        AgentAnalysisIntakeService,
        // Дописывание полей существующих карточек из ais без модели (джоба
        // CALL_REPORT_SMART_BACKFILL в call-report, ночной крон)
        AgentAnalysisSmartRewriteService,
        LlmPriceResolverService,
    ],
    // Приём разбора переиспользует внутренний конвейер (call-report):
    // запись ais, создание/дополнение смарт-элемента, таймлайн разделов и
    // идемпотентность живут здесь и не дублируются. Резолвер цены токенов
    // нужен и test-retest (call-report) для колонок расхода повторов.
    exports: [
        AgentAnalysisIntakeService,
        AgentAnalysisSmartRewriteService,
        LlmPriceResolverService,
    ],
})
export class AgentGateModule {}
