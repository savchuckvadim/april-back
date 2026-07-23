import {
    Injectable,
    InternalServerErrorException,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GigaChat, GigaChatEmbeddings } from 'langchain-gigachat';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Semaphore, parseConcurrency } from '@lib/shared';
import { ChainBuilderService } from '../../application/chain-builder.service';
import {
    CallAnalysisPair,
    LlmProvider,
} from '../../domain/interfaces/llm-provider.interface';
import { MemoryVectorStoreService } from '../vector-store/memory-vector-store.service';
import { extractResult } from '../../application/extract-result.util';
import { LongDialogueService } from '../../application/long-dialogue.service';
import { CombinedCallAnalysisService } from '../../application/combined-call-analysis.service';

/** Дефолтный лимит одновременных обращений к GigaChat (env GIGACHAT_CONCURRENCY). */
const DEFAULT_GIGACHAT_CONCURRENCY = 2;

@Injectable()
export class GigaChatProvider implements LlmProvider {
    private readonly logger = new Logger(GigaChatProvider.name);
    private readonly modelName = 'gigachat';
    private readonly apiKey: string | undefined;
    private llmInstance: GigaChat | null = null;
    private embeddingsInstance: GigaChatEmbeddings | null = null;
    /**
     * Пер-провайдерный лимитер: очередь call-report обрабатывает несколько
     * звонков параллельно, но одновременных запросов к GigaChat — не больше
     * лимита (защита от rate limit и всплеска бюджета).
     */
    private readonly limiter: Semaphore;

    constructor(
        configService: ConfigService,
        private readonly chainBuilder: ChainBuilderService,
        private readonly vectorStoreService: MemoryVectorStoreService,
        private readonly longDialogueService: LongDialogueService,
        private readonly combinedAnalysis: CombinedCallAnalysisService,
    ) {
        this.apiKey = configService.get<string>('GIGACHAT_API_KEY');
        this.limiter = new Semaphore(
            parseConcurrency(
                configService.get<string>('GIGACHAT_CONCURRENCY'),
                DEFAULT_GIGACHAT_CONCURRENCY,
            ),
        );
    }

    async resume(query: string, domain?: string): Promise<string> {
        return this.limiter.run(() => this.run(query, 'resume', domain));
    }

    async recomendation(query: string, domain?: string): Promise<string> {
        return this.limiter.run(() => this.run(query, 'recomendation', domain));
    }

    /**
     * Резюме + рекомендации одним вызовом. Длинные транскрипты идут по
     * прежнему map-reduce пути (там объединение не экономит — вызовов много
     * по построению); ошибка объединённого вызова или непарсибельный ответ —
     * fallback на два раздельных вызова.
     */
    async analyzeCall(
        query: string,
        domain?: string,
    ): Promise<CallAnalysisPair> {
        if (this.longDialogueService.needsChunkedProcessing(query)) {
            this.logger.log(
                `GigaChat analyzeCall: длинный транскрипт (${query.length} симв.) → раздельный map-reduce`,
            );
            return this.analyzeSeparately(query, domain);
        }
        try {
            return await this.limiter.run(() =>
                this.combinedAnalysis.run({
                    llm: this.getLlm() as unknown as BaseChatModel,
                    getRetriever: kind =>
                        this.vectorStoreService.getRetriever(
                            this.getEmbeddings(),
                            this.modelName,
                            domain,
                            kind,
                        ),
                    transcript: query,
                }),
            );
        } catch (error) {
            this.logger.warn(
                `GigaChat объединённый анализ не удался (${(error as Error).message}) — fallback на два вызова`,
            );
            return this.analyzeSeparately(query, domain);
        }
    }

    private async analyzeSeparately(
        query: string,
        domain?: string,
    ): Promise<CallAnalysisPair> {
        const resume = await this.resume(query, domain);
        const recomendation = await this.recomendation(query, domain);
        return { resume, recomendation };
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
            // Upcast через unknown: прямая проверка GigaChat -> BaseChatModel
            // упирается в лимит глубины дженериков TS (флаки TS2589 при сборке)
            const llm = this.getLlm() as unknown as BaseChatModel;

            if (this.longDialogueService.needsChunkedProcessing(query)) {
                this.logger.log(
                    `GigaChat ${kind}: длинный транскрипт (${query.length} симв.) → map-reduce`,
                );
                return kind === 'resume'
                    ? this.longDialogueService.runResume(query, llm, retriever)
                    : this.longDialogueService.runRecommendation(
                          query,
                          llm,
                          retriever,
                      );
            }

            const chain =
                kind === 'resume'
                    ? await this.chainBuilder.buildResumeChain(llm, retriever)
                    : await this.chainBuilder.buildRecommendationChain(
                          llm,
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
