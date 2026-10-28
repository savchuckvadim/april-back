import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { withJsonInstruction } from '../json-instruction.util';
import { LlmEndpointResolverService } from '../llm-endpoint-resolver.service';
import type {
    StructuredLlmAdapter,
    StructuredLlmRequest,
    StructuredLlmResponse,
    StructuredLlmUsage,
} from '../structured-llm.types';

/**
 * Как просить JSON у endpoint'а: `json_schema` — строгая схема в
 * response_format (OpenAI, vLLM, Yandex AI Studio, часть Cloud.ru);
 * `json_object` — только «верни JSON», схема дописывается в системный промпт
 * (модели без structured output).
 */
export const LLM_JSON_MODES = ['json_schema', 'json_object'] as const;
export type LlmJsonMode = (typeof LLM_JSON_MODES)[number];

const DEFAULT_TIMEOUT_MS = 180_000;

interface ChatCompletionsResponse {
    choices?: { message?: { content?: string } }[];
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    };
    model?: string;
}

/** Тело chat/completions: та же форма, что у VibeCode, — потому замена и возможна. */
export function buildChatCompletionBody(
    model: string,
    request: StructuredLlmRequest,
    jsonMode: LlmJsonMode,
): Record<string, unknown> {
    const systemPrompt =
        jsonMode === 'json_schema'
            ? request.systemPrompt
            : withJsonInstruction(request.systemPrompt, request.schema);
    return {
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: request.userContent },
        ],
        response_format:
            jsonMode === 'json_schema'
                ? {
                      type: 'json_schema',
                      json_schema: {
                          name: request.schemaName,
                          strict: true,
                          schema: request.schema,
                      },
                  }
                : { type: 'json_object' },
    };
}

/** Содержимое ответа → JSON; обёртку ```json … ``` некоторых моделей снимаем. */
export function parseJsonContent(content: string): unknown {
    const trimmed = content.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return JSON.parse(fenced ? fenced[1] : trimmed) as unknown;
}

const toTokenCount = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

const usageOf = (
    usage: ChatCompletionsResponse['usage'],
): StructuredLlmUsage => ({
    promptTokens: toTokenCount(usage?.prompt_tokens),
    completionTokens: toTokenCount(usage?.completion_tokens),
    totalTokens: toTokenCount(usage?.total_tokens),
});

/**
 * Любой OpenAI-совместимый endpoint как запасной (или свой) провайдер:
 * Cloud.ru Evolution, Yandex AI Studio, vLLM/Ollama на своём GPU. Адрес,
 * ключ и модель — из кредов портала или env (LlmEndpointResolverService);
 * режим JSON — env LLM_FALLBACK_JSON_MODE, таймаут — LLM_FALLBACK_TIMEOUT_MS.
 */
@Injectable()
export class OpenAiCompatibleStructuredAdapter implements StructuredLlmAdapter {
    readonly code = 'openai-compatible' as const;
    private readonly logger = new Logger(
        OpenAiCompatibleStructuredAdapter.name,
    );
    private readonly jsonMode: LlmJsonMode;
    private readonly timeoutMs: number;

    constructor(
        configService: ConfigService,
        private readonly endpoints: LlmEndpointResolverService,
    ) {
        const mode = configService.get<string>('LLM_FALLBACK_JSON_MODE');
        this.jsonMode = (LLM_JSON_MODES as readonly string[]).includes(
            mode ?? '',
        )
            ? (mode as LlmJsonMode)
            : 'json_schema';
        const timeout = Number(
            configService.get<string>('LLM_FALLBACK_TIMEOUT_MS') ?? NaN,
        );
        this.timeoutMs =
            Number.isFinite(timeout) && timeout > 0
                ? timeout
                : DEFAULT_TIMEOUT_MS;
    }

    async configurationIssue(domain: string): Promise<string | null> {
        return (await this.endpoints.resolve(domain))
            ? null
            : 'не настроен (LLM_FALLBACK_BASE_URL / LLM_FALLBACK_MODEL или креды LLM портала)';
    }

    async complete(
        request: StructuredLlmRequest,
    ): Promise<StructuredLlmResponse> {
        const endpoint = await this.endpoints.resolve(request.domain);
        if (!endpoint) {
            throw new Error(
                `Запасной провайдер LLM не настроен для ${request.domain}`,
            );
        }
        const where = `LLM (${endpoint.source}, ${endpoint.model}) ${request.schemaName}`;
        let response: Response;
        try {
            response = await fetch(`${endpoint.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(endpoint.apiKey
                        ? { Authorization: `Bearer ${endpoint.apiKey}` }
                        : {}),
                },
                body: JSON.stringify(
                    buildChatCompletionBody(
                        endpoint.model,
                        request,
                        this.jsonMode,
                    ),
                ),
                signal: AbortSignal.timeout(this.timeoutMs),
            });
        } catch (error) {
            throw new Error(
                `${where}: сеть или таймаут — ${(error as Error).message}`,
            );
        }
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(
                `${where} failed [${response.status}]: ${text.slice(0, 500)}`,
            );
        }
        const data = (await response.json()) as ChatCompletionsResponse;
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error(`${where}: пустой ответ модели`);
        this.logger.log(
            `${where}: ответ получен (${content.length} знаков, режим ${this.jsonMode})`,
        );
        return {
            result: parseJsonContent(content),
            usage: usageOf(data.usage),
            model: typeof data.model === 'string' ? data.model : endpoint.model,
            provider: this.code,
        };
    }
}
