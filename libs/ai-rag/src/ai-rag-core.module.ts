import { Module } from '@nestjs/common';
import { ChainBuilderService } from './application/chain-builder.service';
import { CombinedCallAnalysisService } from './application/combined-call-analysis.service';
import { LlmOrchestratorService } from './application/llm-orchestrator.service';
import { LongDialogueService } from './application/long-dialogue.service';
import { KnowledgeContentService } from './application/knowledge-content.service';
import { FileLoaderService } from './infrastructure/file-loader/file-loader.service';
import { KnowledgeStorageService } from './infrastructure/knowledge/knowledge-storage.service';
import { MemoryVectorStoreService } from './infrastructure/vector-store/memory-vector-store.service';
import { FakeProvider } from './infrastructure/providers/fake.provider';
import { GigaChatProvider } from './infrastructure/providers/gigachat.provider';
import { OllamaProvider } from './infrastructure/providers/ollama.provider';
import { OpenAiProvider } from './infrastructure/providers/openai.provider';

/**
 * Сервисное ЯДРО ai-rag — провайдеры без контроллеров.
 *
 * Для потребителей, которым нужны сервисы (оркестратор LLM, база
 * знаний), но НЕЛЬЗЯ светить публичные /ai-rag/* роуты в своём Swagger
 * (например, клиентское приложение bitrix-app-client: клиент не должен
 * писать в общую базу знаний). Полный AiRagModule (с контроллерами)
 * импортирует ядро и остаётся точкой входа для прикладных приложений.
 */
@Module({
    providers: [
        ChainBuilderService,
        CombinedCallAnalysisService,
        LlmOrchestratorService,
        LongDialogueService,
        KnowledgeContentService,
        FileLoaderService,
        KnowledgeStorageService,
        MemoryVectorStoreService,
        FakeProvider,
        GigaChatProvider,
        OllamaProvider,
        OpenAiProvider,
    ],
    exports: [
        LlmOrchestratorService,
        KnowledgeStorageService,
        KnowledgeContentService,
        FileLoaderService,
    ],
})
export class AiRagCoreModule {}
