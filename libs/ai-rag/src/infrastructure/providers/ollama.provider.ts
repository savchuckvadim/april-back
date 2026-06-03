import {
    Injectable,
    InternalServerErrorException,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOllama, OllamaEmbeddings } from '@langchain/ollama';
import { ChainBuilderService } from '../../application/chain-builder.service';
import { LlmProvider } from '../../domain/interfaces/llm-provider.interface';
import { MemoryVectorStoreService } from '../vector-store/memory-vector-store.service';
import { extractResult } from '../../application/extract-result.util';

const DEFAULT_OLLAMA_BASE_URL = 'http://45.12.74.239:11434';

@Injectable()
export class OllamaProvider implements LlmProvider {
    private readonly logger = new Logger(OllamaProvider.name);
    private readonly modelName = 'ollama';
    private readonly baseUrl: string;
    private llmInstance: ChatOllama | null = null;
    private embeddingsInstance: OllamaEmbeddings | null = null;

    constructor(
        configService: ConfigService,
        private readonly chainBuilder: ChainBuilderService,
        private readonly vectorStoreService: MemoryVectorStoreService,
    ) {
        this.baseUrl =
            configService.get<string>('OLLAMA_BASE_URL') ??
            DEFAULT_OLLAMA_BASE_URL;
    }

    async resume(query: string, domain?: string): Promise<string> {
        return this.run(query, 'resume', domain);
    }

    async recomendation(query: string, domain?: string): Promise<string> {
        return this.run(query, 'recomendation', domain);
    }

    private async run(
        query: string,
        kind: 'resume' | 'recomendation',
        domain: string | undefined,
    ): Promise<string> {
        try {
            const retriever = await this.vectorStoreService.getRetriever(
                this.getEmbeddings(),
                this.modelName,
                domain,
                kind,
            );
            const chain =
                kind === 'resume'
                    ? await this.chainBuilder.buildResumeChain(
                          this.getLlm(),
                          retriever,
                          true,
                      )
                    : await this.chainBuilder.buildRecommendationChain(
                          this.getLlm(),
                          retriever,
                          true,
                      );
            const result = await chain.invoke({
                input: query,
                chat_history: [],
                context: '',
            });
            return extractResult(result);
        } catch (error) {
            this.logger.error(
                `Ollama ${kind} error: ${(error as Error).message}`,
            );
            throw new InternalServerErrorException((error as Error).message);
        }
    }

    private getLlm(): ChatOllama {
        if (!this.llmInstance) {
            this.llmInstance = new ChatOllama({
                model: 'mistral',
                baseUrl: this.baseUrl,
            });
        }
        return this.llmInstance;
    }

    private getEmbeddings(): OllamaEmbeddings {
        if (!this.embeddingsInstance) {
            this.embeddingsInstance = new OllamaEmbeddings({
                model: 'nomic-embed-text',
                baseUrl: this.baseUrl,
            });
        }
        return this.embeddingsInstance;
    }
}
