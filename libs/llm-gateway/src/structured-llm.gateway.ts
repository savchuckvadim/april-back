import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiRagStructuredAdapter } from './adapters/ai-rag-structured.adapter';
import { OpenAiCompatibleStructuredAdapter } from './adapters/openai-compatible-structured.adapter';
import { VibecodeStructuredAdapter } from './adapters/vibecode-structured.adapter';
import { LlmCircuitBreakerService } from './llm-circuit-breaker.service';
import { describeLlmError, isTransientLlmError } from './llm-error.util';
import {
    isLlmProviderCode,
    type LlmProviderCode,
    type StructuredLlmAdapter,
    type StructuredLlmOptions,
    type StructuredLlmRequest,
    type StructuredLlmResponse,
} from './structured-llm.types';

/**
 * Порядок провайдеров по умолчанию: VibeCode, затем OpenAI-совместимый
 * запасной. `ai-rag` (модели контура 1 со схемой в промпте) — только явно,
 * через LLM_PROVIDER_ORDER, после проверки согласия на выборке.
 */
export const DEFAULT_LLM_PROVIDER_ORDER: readonly LlmProviderCode[] = [
    'vibecode',
    'openai-compatible',
];

/** Порядок из env LLM_PROVIDER_ORDER («openai-compatible,vibecode»); незнакомые коды отбрасываются, пусто — по умолчанию. */
export function resolveProviderOrder(
    raw: string | undefined,
): LlmProviderCode[] {
    const codes = (raw ?? '')
        .split(',')
        .map(code => code.trim())
        .filter(isLlmProviderCode);
    const unique = [...new Set(codes)];
    return unique.length ? unique : [...DEFAULT_LLM_PROVIDER_ORDER];
}

/**
 * Шлюз структурных LLM-вызовов: провайдеры по порядку (env
 * LLM_PROVIDER_ORDER), пропуск ненастроенных и отключённых предохранителем,
 * переход к следующему при ошибке; отказали все — одна ошибка со всеми
 * причинами. Сигнатуры `structuredCompletion*` повторяют VibeCodeClient,
 * только вместо ключа — домен портала: потребители переехали на шлюз
 * заменой инъекции, а не переписыванием вызовов.
 *
 * `@Injectable` без bitrix-состояния: домен приходит параметром.
 */
@Injectable()
export class StructuredLlmGateway {
    private readonly logger = new Logger(StructuredLlmGateway.name);
    private readonly adapters: readonly StructuredLlmAdapter[];

    constructor(
        configService: ConfigService,
        private readonly breaker: LlmCircuitBreakerService,
        vibecode: VibecodeStructuredAdapter,
        openAiCompatible: OpenAiCompatibleStructuredAdapter,
        aiRag: AiRagStructuredAdapter,
    ) {
        const byCode: Record<LlmProviderCode, StructuredLlmAdapter> = {
            vibecode,
            'openai-compatible': openAiCompatible,
            'ai-rag': aiRag,
        };
        this.adapters = resolveProviderOrder(
            configService.get<string>('LLM_PROVIDER_ORDER'),
        ).map(code => byCode[code]);
    }

    /** Коды провайдеров в порядке опроса — для логов и панели состояния. */
    get order(): LlmProviderCode[] {
        return this.adapters.map(adapter => adapter.code);
    }

    /** Strict-JSON вызов: только разобранный результат (как VibeCodeClient.structuredCompletion, 5-й аргумент — домен). */
    async structuredCompletion(
        systemPrompt: string,
        userContent: string,
        schemaName: string,
        schema: Record<string, unknown>,
        domain: string,
        options?: StructuredLlmOptions,
    ): Promise<unknown> {
        return (
            await this.structuredCompletionWithUsage(
                systemPrompt,
                userContent,
                schemaName,
                schema,
                domain,
                options,
            )
        ).result;
    }

    /** То же с расходом токенов, фактической моделью и провайдером, который ответил. */
    structuredCompletionWithUsage(
        systemPrompt: string,
        userContent: string,
        schemaName: string,
        schema: Record<string, unknown>,
        domain: string,
        options?: StructuredLlmOptions,
    ): Promise<StructuredLlmResponse> {
        return this.complete({
            domain,
            systemPrompt,
            userContent,
            schemaName,
            schema,
            ...(options?.model ? { model: options.model } : {}),
        });
    }

    /** Провайдеры по порядку; отказали все — ошибка со всеми причинами. */
    async complete(
        request: StructuredLlmRequest,
    ): Promise<StructuredLlmResponse> {
        const notes: string[] = [];
        const paused: StructuredLlmAdapter[] = [];
        for (const adapter of this.adapters) {
            const issue = await adapter.configurationIssue(request.domain);
            if (issue !== null) {
                notes.push(`${adapter.code} — ${issue}`);
                continue;
            }
            if (await this.breaker.isOpen(adapter.code)) {
                paused.push(adapter);
                notes.push(`${adapter.code} — на паузе после серии сбоев`);
                continue;
            }
            const response = await this.attempt(adapter, request, notes);
            if (response) return response;
        }
        // Живых и настроенных не осталось — пробуем отключённых (полуоткрытое
        // состояние): попытка лучше гарантированного отказа, а удача снова
        // включит провайдера.
        for (const adapter of paused) {
            const response = await this.attempt(adapter, request, notes);
            if (response) return response;
        }
        throw new Error(
            `LLM недоступна для ${request.schemaName} (${request.domain}): ${notes.join('; ')}`,
        );
    }

    private async attempt(
        adapter: StructuredLlmAdapter,
        request: StructuredLlmRequest,
        notes: string[],
    ): Promise<StructuredLlmResponse | null> {
        try {
            const response = await adapter.complete(request);
            await this.breaker.recordSuccess(adapter.code);
            return response;
        } catch (error) {
            const text = describeLlmError(error);
            notes.push(`${adapter.code} — ${text}`);
            if (isTransientLlmError(error)) {
                await this.breaker.recordFailure(adapter.code, text);
            }
            this.logger.warn(
                `Провайдер LLM ${adapter.code} не ответил на ${request.schemaName} (${request.domain}): ${text}`,
            );
            return null;
        }
    }
}
