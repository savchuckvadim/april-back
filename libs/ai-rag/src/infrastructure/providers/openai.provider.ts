import {
    Injectable,
    InternalServerErrorException,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { ChainBuilderService } from '../../application/chain-builder.service';
import {
    CallAnalysisPair,
    LlmProvider,
} from '../../domain/interfaces/llm-provider.interface';
import { MemoryVectorStoreService } from '../vector-store/memory-vector-store.service';
import { extractResult } from '../../application/extract-result.util';
import { CombinedCallAnalysisService } from '../../application/combined-call-analysis.service';

@Injectable()
export class OpenAiProvider implements LlmProvider {
    private readonly logger = new Logger(OpenAiProvider.name);
    private readonly modelName = 'openai';
    private readonly apiKey: string | undefined;
    private llmInstance: ChatOpenAI | null = null;
    private embeddingsInstance: OpenAIEmbeddings | null = null;

    constructor(
        configService: ConfigService,
        private readonly chainBuilder: ChainBuilderService,
        private readonly vectorStoreService: MemoryVectorStoreService,
        private readonly combinedAnalysis: CombinedCallAnalysisService,
    ) {
        this.apiKey = configService.get<string>('OPENAI_API_KEY');
    }

    async resume(query: string, domain?: string): Promise<string> {
        return this.run(query, 'resume', domain);
    }

    async recomendation(query: string, domain?: string): Promise<string> {
        return this.run(query, 'recomendation', domain);
    }

    /** Резюме + рекомендации одним вызовом; при сбое — два раздельных. */
    async analyzeCall(
        query: string,
        domain?: string,
    ): Promise<CallAnalysisPair> {
        try {
            return await this.combinedAnalysis.run({
                llm: this.getLlm(),
                getRetriever: kind =>
                    this.vectorStoreService.getRetriever(
                        this.getEmbeddings(),
                        this.modelName,
                        domain,
                        kind,
                    ),
                transcript: query,
            });
        } catch (error) {
            this.logger.warn(
                `OpenAI объединённый анализ не удался (${(error as Error).message}) — fallback на два вызова`,
            );
            return {
                resume: await this.resume(query, domain),
                recomendation: await this.recomendation(query, domain),
            };
        }
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
                      )
                    : await this.chainBuilder.buildRecommendationChain(
                          this.getLlm(),
                          retriever,
                      );
            const result = await chain.invoke({ input: query, context: '' });
            return extractResult(result);
        } catch (error) {
            this.logger.error(
                `OpenAI ${kind} error: ${(error as Error).message}`,
            );
            throw new InternalServerErrorException((error as Error).message);
        }
    }

    private getLlm(): ChatOpenAI {
        if (!this.llmInstance) {
            this.llmInstance = new ChatOpenAI({
                model: 'gpt-3.5-turbo',
                apiKey: this.requireApiKey(),
            });
        }
        return this.llmInstance;
    }

    private getEmbeddings(): OpenAIEmbeddings {
        if (!this.embeddingsInstance) {
            this.embeddingsInstance = new OpenAIEmbeddings({
                apiKey: this.requireApiKey(),
            });
        }
        return this.embeddingsInstance;
    }

    private requireApiKey(): string {
        if (!this.apiKey) {
            throw new Error('Не задана переменная окружения OPENAI_API_KEY');
        }
        return this.apiKey;
    }
}
