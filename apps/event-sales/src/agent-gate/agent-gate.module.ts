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
import { AgentKeyGuard } from './guards/agent-key.guard';
import { AgentCallsController } from './controllers/agent-calls.controller';
import { AgentKnowledgeController } from './controllers/agent-knowledge.controller';
import { AgentBitrixContextService } from './services/agent-bitrix-context.service';
import { AgentCallPackageService } from './services/agent-call-package.service';
import { AgentAnalysisIntakeService } from './services/agent-analysis-intake.service';

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
    ],
    controllers: [AgentCallsController, AgentKnowledgeController],
    providers: [
        AgentKeyGuard,
        AgentBitrixContextService,
        AgentCallPackageService,
        AgentAnalysisIntakeService,
    ],
    // Приём разбора переиспользует внутренний конвейер (call-report):
    // запись ais, создание/дополнение смарт-элемента, таймлайн разделов и
    // идемпотентность живут здесь и не дублируются.
    exports: [AgentAnalysisIntakeService],
})
export class AgentGateModule {}
