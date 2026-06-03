import {
    Injectable,
    InternalServerErrorException,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GigaChat, GigaChatEmbeddings } from 'langchain-gigachat';
import { ChainBuilderService } from '../../application/chain-builder.service';
import { LlmProvider } from '../../domain/interfaces/llm-provider.interface';
import { MemoryVectorStoreService } from '../vector-store/memory-vector-store.service';
import { extractResult } from '../../application/extract-result.util';
import { LongDialogueService } from '../../application/long-dialogue.service';

@Injectable()
export class GigaChatProvider implements LlmProvider {
    private readonly logger = new Logger(GigaChatProvider.name);
    private readonly modelName = 'gigachat';
    private readonly apiKey: string | undefined;
    private llmInstance: GigaChat | null = null;
    private embeddingsInstance: GigaChatEmbeddings | null = null;

    constructor(
        configService: ConfigService,
        private readonly chainBuilder: ChainBuilderService,
        private readonly vectorStoreService: MemoryVectorStoreService,
        private readonly longDialogueService: LongDialogueService,
    ) {
        this.apiKey = configService.get<string>('GIGACHAT_API_KEY');
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

            if (this.longDialogueService.needsChunkedProcessing(query)) {
                this.logger.log(
                    `GigaChat ${kind}: длинный транскрипт (${query.length} симв.) → map-reduce`,
                );
                return kind === 'resume'
                    ? this.longDialogueService.runResume(
                          query,
                          this.getLlm(),
                          retriever,
                      )
                    : this.longDialogueService.runRecommendation(
                          query,
                          this.getLlm(),
                          retriever,
                      );
            }

            const chain =
                kind === 'resume'
                    ? await this.chainBuilder.buildResumeChain(
                          this.getLlm(),
                          retriever,
                      )
                    : await this.chainBuilder.buildRecommendationChain(
                          this.getLlm(),
                          retriever,
                      );
            const result = await chain.invoke({ input: query, context: '' });
            return extractResult(result);
        } catch (error) {
            this.logger.error(
                `GigaChat ${kind} error: ${(error as Error).message}`,
            );
            throw new InternalServerErrorException((error as Error).message);
        }
    }

    private getLlm(): GigaChat {
        if (!this.llmInstance) {
            this.llmInstance = new GigaChat({
                credentials: this.requireApiKey(),
            });
        }
        return this.llmInstance;
    }

    private getEmbeddings(): GigaChatEmbeddings {
        if (!this.embeddingsInstance) {
            this.embeddingsInstance = new GigaChatEmbeddings({
                credentials: this.requireApiKey(),
            });
        }
        return this.embeddingsInstance;
    }

    private requireApiKey(): string {
        if (!this.apiKey) {
            throw new Error('Не задана переменная окружения GIGACHAT_API_KEY');
        }
        return this.apiKey;
    }
}
