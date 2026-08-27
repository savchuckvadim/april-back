import { readFileSync } from 'fs';
import { Agent } from 'https';
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

/**
 * Порог объединённого анализа, символов (env GIGACHAT_COMBINED_MAX_CHARS).
 * НЕ равен порогу map-reduce (TRANSCRIPT_CHAR_THRESHOLD=900, тюнинг
 * раздельных вызовов): 900 символов — это ~минута разговора, с таким
 * порогом объединённый вызов не срабатывал бы почти никогда и экономия
 * терялась. Транскрипт 10-минутного звонка (~8-10К симв.) современный
 * GigaChat берёт одним вызовом; длиннее порога — откат на map-reduce.
 */
const DEFAULT_COMBINED_MAX_CHARS = 12_000;

@Injectable()
export class GigaChatProvider implements LlmProvider {
    private readonly logger = new Logger(GigaChatProvider.name);
    private readonly modelName = 'gigachat';
    private readonly apiKey: string | undefined;
    private llmInstance: GigaChat | null = null;
    private embeddingsInstance: GigaChatEmbeddings | null = null;
    /**
     * TLS для сбер-шлюза ngw.devices.sberbank.ru: он подписан российским
     * корневым сертификатом (Минцифры), которого нет в стандартном
     * CA-бандле Node — без настройки авторизация падает с
     * SELF_SIGNED_CERT_IN_CHAIN (боевой инцидент 2026-07-29).
     * GIGACHAT_CA_PATH — путь к PEM Russian Trusted Root CA (правильный
     * путь); GIGACHAT_INSECURE_TLS=1 — отключить проверку (быстрый обход).
     */
    private readonly httpsAgent: Agent | undefined;
    /**
     * Пер-провайдерный лимитер: очередь call-report обрабатывает несколько
     * звонков параллельно, но одновременных запросов к GigaChat — не больше
     * лимита (защита от rate limit и всплеска бюджета).
     */
    private readonly limiter: Semaphore;
    /** Максимум символов транскрипта для объединённого вызова. */
    private readonly combinedMaxChars: number;
    /**
     * Тип доступа GigaChat (env GIGACHAT_SCOPE): GIGACHAT_API_PERS —
     * физлицо, GIGACHAT_API_B2B — юрлицо, GIGACHAT_API_CORP —
     * корпоративный. Передаём ЯВНО и в чат, и в эмбеддинги: SDK по
     * умолчанию подставляет PERS, поэтому смена ключа на юрлицо без этой
     * переменной молча ломает авторизацию (боевой переход 27.08.2026).
     */
    private readonly scope: string | undefined;

    constructor(
        configService: ConfigService,
        private readonly chainBuilder: ChainBuilderService,
        private readonly vectorStoreService: MemoryVectorStoreService,
        private readonly longDialogueService: LongDialogueService,
        private readonly combinedAnalysis: CombinedCallAnalysisService,
    ) {
        this.apiKey = configService.get<string>('GIGACHAT_API_KEY');
        this.scope = configService.get<string>('GIGACHAT_SCOPE');
        this.httpsAgent = this.buildHttpsAgent(configService);
        this.limiter = new Semaphore(
            parseConcurrency(
                configService.get<string>('GIGACHAT_CONCURRENCY'),
                DEFAULT_GIGACHAT_CONCURRENCY,
            ),
        );
        const rawCombined = configService.get<string>(
            'GIGACHAT_COMBINED_MAX_CHARS',
        );
        const parsedCombined = rawCombined
            ? Number.parseInt(rawCombined, 10)
            : NaN;
        this.combinedMaxChars =
            Number.isFinite(parsedCombined) && parsedCombined > 0
                ? parsedCombined
                : DEFAULT_COMBINED_MAX_CHARS;
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
        // Порог объединённого вызова СВОЙ (combinedMaxChars), не порог
        // map-reduce: см. комментарий у DEFAULT_COMBINED_MAX_CHARS.
        if (query.length > this.combinedMaxChars) {
            this.logger.log(
                `GigaChat analyzeCall: транскрипт ${query.length} симв. > ` +
                    `${this.combinedMaxChars} → раздельный map-reduce`,
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

    /** TLS-агент для сбер-шлюза; undefined — стандартное поведение Node. */
    private buildHttpsAgent(configService: ConfigService): Agent | undefined {
        const caPath = configService.get<string>('GIGACHAT_CA_PATH');
        if (caPath) {
            try {
                return new Agent({ ca: readFileSync(caPath) });
            } catch (error) {
                this.logger.error(
                    `GIGACHAT_CA_PATH не прочитан (${caPath}): ${(error as Error).message}`,
                );
            }
        }
        if (configService.get<string>('GIGACHAT_INSECURE_TLS') === '1') {
            this.logger.warn(
                'GIGACHAT_INSECURE_TLS=1 — проверка TLS-сертификата сбер-шлюза ОТКЛЮЧЕНА (используйте GIGACHAT_CA_PATH для боевого режима)',
            );
            return new Agent({ rejectUnauthorized: false });
        }
        return undefined;
    }

    private getLlm(): GigaChat {
        if (!this.llmInstance) {
            this.llmInstance = new GigaChat({
                credentials: this.requireApiKey(),
                scope: this.scope,
                httpsAgent: this.httpsAgent,
            });
            this.logger.log(
                `GigaChat: тип доступа ${
                    this.scope ??
                    'GIGACHAT_API_PERS (по умолчанию — ФИЗЛИЦО; для ключа ' +
                        'юрлица задайте GIGACHAT_SCOPE)'
                }`,
            );
        }
        return this.llmInstance;
    }

    private getEmbeddings(): GigaChatEmbeddings {
        if (!this.embeddingsInstance) {
            this.embeddingsInstance = new GigaChatEmbeddings({
                credentials: this.requireApiKey(),
                scope: this.scope,
                httpsAgent: this.httpsAgent,
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
