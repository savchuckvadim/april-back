import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLM_MODELS, LlmOrchestratorService, type LlmModel } from '@lib/ai-rag';
import { PortalAiSettingsService } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.service';
import { withJsonInstruction } from '../json-instruction.util';
import type {
    StructuredLlmAdapter,
    StructuredLlmRequest,
    StructuredLlmResponse,
} from '../structured-llm.types';
import { parseJsonContent } from './openai-compatible-structured.adapter';

/** Модель по умолчанию — та же, что у резюме и рекомендаций контура 1. */
const DEFAULT_MODEL: LlmModel = 'gigachat';

const asLlmModel = (value: unknown): LlmModel | null =>
    typeof value === 'string' && LLM_MODELS.includes(value as LlmModel)
        ? (value as LlmModel)
        : null;

/**
 * Третий эшелон шлюза: модели оркестратора контура 1 (GigaChat, Cloud.ru,
 * Ollama, OpenAI) через `LlmOrchestratorService.complete` — без RAG, схема
 * дописывается в системный промпт, ответ разбирается как JSON. Модель —
 * env LLM_AI_RAG_MODEL, иначе `llmModel` портала (как у контура 1), иначе
 * gigachat. Расход токенов оркестратор не отдаёт — usage пустой.
 *
 * В порядок по умолчанию не входит: строгую схему эти модели не держат, и
 * включать их для разборов стоит после проверки согласия на выборке —
 * `LLM_PROVIDER_ORDER=vibecode,openai-compatible,ai-rag` (идея владельца
 * 28.10.2026: «класс на любые OpenAI-совместимые — метод на любой промпт»).
 */
@Injectable()
export class AiRagStructuredAdapter implements StructuredLlmAdapter {
    readonly code = 'ai-rag' as const;
    private readonly logger = new Logger(AiRagStructuredAdapter.name);
    private readonly envModel: LlmModel | null;

    constructor(
        configService: ConfigService,
        private readonly orchestrator: LlmOrchestratorService,
        private readonly portalAiSettings: PortalAiSettingsService,
    ) {
        this.envModel = asLlmModel(
            configService.get<string>('LLM_AI_RAG_MODEL')?.trim(),
        );
    }

    /** Модель есть всегда (дефолт gigachat); отсутствие ключа всплывёт в вызове. */
    configurationIssue(): Promise<string | null> {
        return Promise.resolve(null);
    }

    async complete(
        request: StructuredLlmRequest,
    ): Promise<StructuredLlmResponse> {
        const model = await this.modelFor(request.domain);
        const text = await this.orchestrator.complete(
            model,
            withJsonInstruction(request.systemPrompt, request.schema),
            request.userContent,
        );
        this.logger.log(
            `ai-rag (${model}) ${request.schemaName} (${request.domain}): ответ получен (${text.length} знаков)`,
        );
        return {
            result: parseJsonContent(text),
            usage: {
                promptTokens: null,
                completionTokens: null,
                totalTokens: null,
            },
            model,
            provider: this.code,
        };
    }

    /** env → llmModel портала → gigachat; ошибка чтения настроек не роняет вызов. */
    private async modelFor(domain: string): Promise<LlmModel> {
        if (this.envModel) return this.envModel;
        try {
            const record = await this.portalAiSettings.getByDomain(domain);
            return asLlmModel(record?.llmModel) ?? DEFAULT_MODEL;
        } catch (error) {
            this.logger.warn(
                `Настройки AI портала ${domain} не прочитаны (${(error as Error).message}) — модель ${DEFAULT_MODEL}`,
            );
            return DEFAULT_MODEL;
        }
    }
}
