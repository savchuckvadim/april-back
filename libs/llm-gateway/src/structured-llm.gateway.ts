import { Injectable, Logger } from '@nestjs/common';
import { AiRagStructuredAdapter } from './adapters/ai-rag-structured.adapter';
import { OpenAiCompatibleStructuredAdapter } from './adapters/openai-compatible-structured.adapter';
import { VibecodeStructuredAdapter } from './adapters/vibecode-structured.adapter';
import { LlmCircuitBreakerService } from './llm-circuit-breaker.service';
import { describeLlmError, isTransientLlmError } from './llm-error.util';
import { LlmProviderOrderResolver } from './llm-provider-order.resolver';
import {
    type LlmProviderCode,
    type StructuredLlmAdapter,
    type StructuredLlmOptions,
    type StructuredLlmRequest,
    type StructuredLlmResponse,
} from './structured-llm.types';

export {
    DEFAULT_LLM_PROVIDER_ORDER,
    resolveProviderOrder,
} from './llm-provider-order.util';

/**
 * Шлюз структурных LLM-вызовов: провайдеры по порядку (настройка портала,
 * иначе env LLM_PROVIDER_ORDER — LlmProviderOrderResolver), пропуск
 * ненастроенных и отключённых предохранителем, переход к следующему при
 * ошибке; отказали все — одна ошибка со всеми причинами. Сигнатуры
 * `structuredCompletion*` повторяют VibeCodeClient, только вместо ключа —
 * домен портала: потребители переехали на шлюз заменой инъекции, а не
 * переписыванием вызовов.
 *
 * `@Injectable` без bitrix-состояния: домен приходит параметром.
 */
@Injectable()
export class StructuredLlmGateway {
    private readonly logger = new Logger(StructuredLlmGateway.name);
    private readonly byCode: Record<LlmProviderCode, StructuredLlmAdapter>;

    constructor(
        private readonly orderResolver: LlmProviderOrderResolver,
        private readonly breaker: LlmCircuitBreakerService,
        vibecode: VibecodeStructuredAdapter,
        openAiCompatible: OpenAiCompatibleStructuredAdapter,
        aiRag: AiRagStructuredAdapter,
    ) {
        this.byCode = {
            vibecode,
            'openai-compatible': openAiCompatible,
            'ai-rag': aiRag,
        };
    }

    /** Общий порядок приложения (без учёта портала) — для логов и панели состояния. */
    get order(): LlmProviderCode[] {
        return [...this.orderResolver.fallbackOrder];
    }

    /** Порядок провайдеров для домена: настройка портала, иначе общий. */
    orderFor(domain: string): Promise<LlmProviderCode[]> {
        return this.orderResolver.orderFor(domain);
    }

    /**
     * Настроен ли каждый провайдер для домена (в его порядке): `issue`
     * null — настроен, иначе причина (нет ключа портала, нет endpoint'а).
     * Для чек-листов админки; сеть не трогает.
     */
    async availability(
        domain: string,
    ): Promise<{ code: LlmProviderCode; issue: string | null }[]> {
        const order = await this.orderResolver.orderFor(domain);
        return Promise.all(
            order.map(async code => ({
                code,
                issue: await this.byCode[code].configurationIssue(domain),
            })),
        );
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
        const order = await this.orderResolver.orderFor(request.domain);
        for (const adapter of order.map(code => this.byCode[code])) {
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
