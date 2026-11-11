import { Injectable, Logger } from '@nestjs/common';
import { EgressProxyService } from '@lib/egress-proxy';
import {
    LLM_FALLBACK_JSON_MODES,
    type LlmFallbackJsonMode,
} from '@lib/vendor-settings';
import { withJsonInstruction } from '../json-instruction.util';
import { LlmEndpointResolverService } from '../llm-endpoint-resolver.service';
import { LlmGatewaySettingsService } from '../llm-gateway-settings.service';
import type {
    LlmSendGuard,
    StructuredLlmAdapter,
    StructuredLlmRequest,
    StructuredLlmResponse,
    StructuredLlmUsage,
} from '../structured-llm.types';

/**
 * Как просить JSON у endpoint'а: `json_schema` — строгая схема в
 * response_format (OpenAI, vLLM, Yandex AI Studio, часть Cloud.ru);
 * `json_object` — только «верни JSON», схема дописывается в системный промпт
 * (модели без structured output). Список живёт в реестре настроек — по нему
 * же админка проверяет значение.
 */
export const LLM_JSON_MODES = LLM_FALLBACK_JSON_MODES;
export type LlmJsonMode = LlmFallbackJsonMode;

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
 * Cloud.ru Evolution, Groq, Yandex AI Studio, vLLM/Ollama на своём GPU. Адрес,
 * ключ и модель — из кредов портала или общих настроек
 * (LlmEndpointResolverService); режим JSON и срок ответа — «Настройки
 * приложения» в админке (LlmGatewaySettingsService), читаются на каждом
 * вызове.
 */
@Injectable()
export class OpenAiCompatibleStructuredAdapter implements StructuredLlmAdapter {
    readonly code = 'openai-compatible' as const;
    private readonly logger = new Logger(
        OpenAiCompatibleStructuredAdapter.name,
    );

    constructor(
        private readonly settings: LlmGatewaySettingsService,
        private readonly endpoints: LlmEndpointResolverService,
        private readonly egress: EgressProxyService,
    ) {}

    async configurationIssue(domain: string): Promise<string | null> {
        return (await this.endpoints.resolve(domain))
            ? null
            : 'не настроен: нет кредов LLM портала, своего запасного поставщика, ключа Cloud.ru или Groq в «Настройках приложения»';
    }

    async complete(
        request: StructuredLlmRequest,
        guard?: LlmSendGuard,
    ): Promise<StructuredLlmResponse> {
        const endpoint = await this.endpoints.resolve(request.domain);
        if (!endpoint) {
            throw new Error(
                `Запасной провайдер LLM не настроен для ${request.domain}`,
            );
        }
        const { jsonMode, timeoutMs } = await this.settings.fallbackCall();
        const where = `LLM (${endpoint.source}, ${endpoint.model}) ${request.schemaName}`;
        // Проверка шлюза у самой отправки: пауза предохранителя, замок пробы.
        await guard?.beforeSend();
        let response: Response;
        try {
            // Зарубежный endpoint (OpenAI, Groq…) — через исходящий прокси,
            // если его хост в EGRESS_PROXY_HOSTS; Cloud.ru и свои — напрямую.
            response = await this.egress.fetch(
                `${endpoint.baseUrl}/chat/completions`,
                {
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
                            jsonMode,
                        ),
                    ),
                    signal: AbortSignal.timeout(timeoutMs),
                },
            );
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
            `${where}: ответ получен (${content.length} знаков, режим ${jsonMode})`,
        );
        return {
            result: parseJsonContent(content),
            usage: usageOf(data.usage),
            model: typeof data.model === 'string' ? data.model : endpoint.model,
            provider: this.code,
        };
    }
}
