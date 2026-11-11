import { Injectable, Logger } from '@nestjs/common';
import { AiRagStructuredAdapter } from './adapters/ai-rag-structured.adapter';
import { OpenAiCompatibleStructuredAdapter } from './adapters/openai-compatible-structured.adapter';
import { VibecodeStructuredAdapter } from './adapters/vibecode-structured.adapter';
import { LlmCircuitBreakerService } from './llm-circuit-breaker.service';
import { LlmProviderCalls, type LlmCallTrail } from './llm-provider-calls';
import { LlmProviderOrderResolver } from './llm-provider-order.resolver';
import { LlmUnavailableError } from './llm-unavailable.error';
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
    /** Вызовы поставщиков: журнал, предохранитель, проверка паузы, проба. */
    private readonly calls: LlmProviderCalls;

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
        this.calls = new LlmProviderCalls(breaker, this.logger);
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

    /**
     * Почему провайдер нельзя использовать для домена (нет ключа, нет
     * endpoint'а); null — настроен. Для ручек админки; сеть не трогает.
     */
    configurationIssueOf(
        code: LlmProviderCode,
        domain: string,
    ): Promise<string | null> {
        return this.byCode[code].configurationIssue(domain);
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

    /**
     * Провайдеры по порядку (явный `providers` запроса важнее настройки
     * портала); отказали все — LlmUnavailableError: текст со всеми
     * причинами и сорвавшиеся вызовы с признаком временного сбоя.
     */
    async complete(
        request: StructuredLlmRequest,
    ): Promise<StructuredLlmResponse> {
        const trail: LlmCallTrail = { notes: [], failures: [] };
        const paused: StructuredLlmAdapter[] = [];
        /** Первый настроенный поставщик — по нему решается «временный ли отказ». */
        let primary: LlmProviderCode | null = null;
        const order = request.providers?.length
            ? [...request.providers]
            : await this.orderResolver.orderFor(request.domain);
        const adapters = order.map(code => this.byCode[code]);
        for (const [index, adapter] of adapters.entries()) {
            const issue = await adapter.configurationIssue(request.domain);
            if (issue !== null) {
                trail.notes.push(`${adapter.code} — ${issue}`);
                continue;
            }
            primary ??= adapter.code;
            if (await this.breaker.isOpen(adapter.code)) {
                paused.push(adapter);
                trail.notes.push(
                    `${adapter.code} — на паузе после серии сбоев`,
                );
                continue;
            }
            const outcome = await this.calls.attempt(
                adapter,
                request,
                trail,
                index < adapters.length - 1,
            );
            if (outcome === 'paused') paused.push(adapter);
            else if (outcome) return this.answered(outcome, request, trail);
        }
        // Живых и настроенных не осталось — пробуем отключённых (полуоткрытое
        // состояние): попытка лучше гарантированного отказа, а удача снова
        // включит провайдера. Проба — одна за раз (LlmProviderCalls.probe).
        for (const [index, adapter] of paused.entries()) {
            const response = await this.calls.probe(
                adapter,
                request,
                trail,
                index < paused.length - 1,
            );
            if (response) return this.answered(response, request, trail);
        }
        const reasons = trail.notes.join('; ');
        await this.alertExhausted(request, reasons, primary, trail);
        throw new LlmUnavailableError(
            `LLM недоступна для ${request.schemaName} (${request.domain}): ${reasons}`,
            trail.failures,
            primary,
        );
    }

    /**
     * Настоящая тревога (решение владельца 08.11.2026 «писать, когда
     * отказали все»): ни один поставщик не ответил, работа встала. Если
     * основного в этом вызове не звали — он на паузе (о ней предохранитель
     * уже сообщил) — тревога одна за паузу, остальные такие отказы — в
     * журнал (ревью 11.11.2026: иначе каждый отложенный вызов слал своё
     * «ПОПЫТКИ ИСЧЕРПАНЫ», и Telegram глушил сообщение «снова отвечает»).
     */
    private async alertExhausted(
        request: StructuredLlmRequest,
        reasons: string,
        primary: LlmProviderCode | null,
        trail: LlmCallTrail,
    ): Promise<void> {
        const text =
            `ПОПЫТКИ ИСЧЕРПАНЫ: LLM не ответила на ${request.schemaName} (${request.domain}) — ` +
            `отказали все поставщики: ${reasons}`;
        const primaryTried =
            primary === null ||
            trail.failures.some(
                failure => failure.provider === primary && !failure.paused,
            );
        if (primaryTried || (await this.breaker.claimPausedAlert(primary))) {
            this.logger.error(text, { telegram: true });
            return;
        }
        this.logger.warn(
            `${text} (основной ${primary} на паузе, тревога о ней уже отправлена)`,
        );
    }

    /**
     * Ответ получен не от первого провайдера порядка — в лог уходит, кто
     * ответил и почему пропущены предыдущие (нет ключа, пауза предохранителя,
     * ошибка). Раньше пропуск по паузе или настройке был молчаливым, и
     * разборы уходили запасному провайдеру без следа в логах (B3, 09.11.2026).
     */
    private answered(
        response: StructuredLlmResponse,
        request: StructuredLlmRequest,
        trail: LlmCallTrail,
    ): StructuredLlmResponse {
        if (trail.notes.length > 0) {
            this.logger.warn(
                `LLM ${request.schemaName} (${request.domain}): ответил ${response.provider}, ` +
                    `пропущены: ${trail.notes.join('; ')}`,
            );
        }
        return response;
    }
}
