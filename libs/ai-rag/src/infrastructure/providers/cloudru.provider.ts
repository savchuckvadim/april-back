import {
    Injectable,
    InternalServerErrorException,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { Semaphore, parseConcurrency } from '@lib/shared';
import { ChainBuilderService } from '../../application/chain-builder.service';
import {
    CallAnalysisPair,
    LlmProvider,
} from '../../domain/interfaces/llm-provider.interface';
import { MemoryVectorStoreService } from '../vector-store/memory-vector-store.service';
import { extractResult } from '../../application/extract-result.util';
import { CombinedCallAnalysisService } from '../../application/combined-call-analysis.service';

/** OpenAI-совместимый endpoint Cloud.ru Evolution Foundation Models. */
const DEFAULT_CLOUDRU_BASE_URL = 'https://foundation-models.api.cloud.ru/v1';
/** Дефолтная LLM каталога (id в формате vendor/model — сверять с каталогом Cloud.ru). */
const DEFAULT_CLOUDRU_MODEL = 'Qwen/Qwen3-235B-A22B-Instruct-2507';
/** Дефолтные embeddings — открытая мультиязычная bge-m3 (русский поддерживает). */
const DEFAULT_CLOUDRU_EMBEDDINGS_MODEL = 'BAAI/bge-m3';
/** Дефолтный лимит одновременных обращений (env CLOUDRU_CONCURRENCY). */
const DEFAULT_CLOUDRU_CONCURRENCY = 2;

/**
 * Cloud.ru Evolution Foundation Models — открытые модели (Qwen3 и др.)
 * в РФ-облаке за OpenAI-совместимым API, оплата за токены.
 *
 * baseURL настраивается (CLOUDRU_BASE_URL), поэтому этим же провайдером
 * можно подключить любой OpenAI-совместимый endpoint: vLLM на своём GPU,
 * Yandex AI Studio и т.п. — меняется только env.
 *
 * ВАЖНО: в каталоге Cloud.ru кроме открытых моделей есть «внешние»
 * модели-прокси на зарубежных провайдеров (Claude, GPT, Gemini) — для
 * данных клиентов использовать ТОЛЬКО открытые модели, размещённые в РФ
 * (Qwen, bge-m3 и т.п.).
 */
@Injectable()
export class CloudRuProvider implements LlmProvider {
    private readonly logger = new Logger(CloudRuProvider.name);
    /** Ключ кэша вектор-стора (см. MemoryVectorStoreService). */
    private readonly modelName = 'cloudru';
    private readonly apiKey: string | undefined;
    private readonly baseUrl: string;
    private readonly model: string;
    private readonly embeddingsModel: string;
    private llmInstance: ChatOpenAI | null = null;
    private embeddingsInstance: OpenAIEmbeddings | null = null;
    /**
     * Пер-провайдерный лимитер одновременных запросов: у Cloud.ru есть
     * RPS-лимиты, а очередь call-report обрабатывает звонки параллельно.
     */
    private readonly limiter: Semaphore;

    constructor(
        configService: ConfigService,
        private readonly chainBuilder: ChainBuilderService,
        private readonly vectorStoreService: MemoryVectorStoreService,
        private readonly combinedAnalysis: CombinedCallAnalysisService,
    ) {
        this.apiKey = configService.get<string>('CLOUDRU_API_KEY');
        this.baseUrl =
            configService.get<string>('CLOUDRU_BASE_URL') ??
            DEFAULT_CLOUDRU_BASE_URL;
        this.model =
            configService.get<string>('CLOUDRU_MODEL') ?? DEFAULT_CLOUDRU_MODEL;
        this.embeddingsModel =
            configService.get<string>('CLOUDRU_EMBEDDINGS_MODEL') ??
            DEFAULT_CLOUDRU_EMBEDDINGS_MODEL;
        this.limiter = new Semaphore(
            parseConcurrency(
                configService.get<string>('CLOUDRU_CONCURRENCY'),
                DEFAULT_CLOUDRU_CONCURRENCY,
            ),
        );
    }

    async resume(query: string, domain?: string): Promise<string> {
        return this.limiter.run(() => this.run(query, 'resume', domain));
    }

    async recomendation(query: string, domain?: string): Promise<string> {
        return this.limiter.run(() => this.run(query, 'recomendation', domain));
    }

    /** Резюме + рекомендации одним вызовом; при сбое — два раздельных. */
    async analyzeCall(
        query: string,
        domain?: string,
    ): Promise<CallAnalysisPair> {
        try {
            return await this.limiter.run(() =>
                this.combinedAnalysis.run({
                    llm: this.getLlm(),
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
                `Cloud.ru объединённый анализ не удался (${(error as Error).message}) — fallback на два вызова`,
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
                `Cloud.ru ${kind} error: ${(error as Error).message}`,
            );
            throw new InternalServerErrorException((error as Error).message);
        }
    }

    private getLlm(): ChatOpenAI {
        if (!this.llmInstance) {
            this.llmInstance = new ChatOpenAI({
                model: this.model,
                apiKey: this.requireApiKey(),
                configuration: { baseURL: this.baseUrl },
            });
        }
        return this.llmInstance;
    }

    private getEmbeddings(): OpenAIEmbeddings {
        if (!this.embeddingsInstance) {
            this.embeddingsInstance = new OpenAIEmbeddings({
                model: this.embeddingsModel,
                apiKey: this.requireApiKey(),
                configuration: { baseURL: this.baseUrl },
            });
        }
        return this.embeddingsInstance;
    }

    private requireApiKey(): string {
        if (!this.apiKey) {
            throw new Error('Не задана переменная окружения CLOUDRU_API_KEY');
        }
        return this.apiKey;
    }
}
