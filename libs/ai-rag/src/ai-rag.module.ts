import { Module } from '@nestjs/common';
import { AiRagController } from './controllers/ai-rag.controller';
import { AiRagKnowledgeController } from './controllers/ai-rag-knowledge.controller';
import { ChainBuilderService } from './application/chain-builder.service';
import { LlmOrchestratorService } from './application/llm-orchestrator.service';
import { LongDialogueService } from './application/long-dialogue.service';
import { FileLoaderService } from './infrastructure/file-loader/file-loader.service';
import { KnowledgeStorageService } from './infrastructure/knowledge/knowledge-storage.service';
import { MemoryVectorStoreService } from './infrastructure/vector-store/memory-vector-store.service';
import { FakeProvider } from './infrastructure/providers/fake.provider';
import { GigaChatProvider } from './infrastructure/providers/gigachat.provider';
import { OllamaProvider } from './infrastructure/providers/ollama.provider';
import { OpenAiProvider } from './infrastructure/providers/openai.provider';

@Module({
    controllers: [AiRagController, AiRagKnowledgeController],
    providers: [
        ChainBuilderService,
        LlmOrchestratorService,
        LongDialogueService,
        FileLoaderService,
        KnowledgeStorageService,
        MemoryVectorStoreService,
        FakeProvider,
        GigaChatProvider,
        OllamaProvider,
        OpenAiProvider,
    ],
    exports: [LlmOrchestratorService, KnowledgeStorageService],
})
export class AiRagModule {}
