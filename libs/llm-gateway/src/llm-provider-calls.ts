import type { Logger } from '@nestjs/common';
import {
    describeLlmCallFailure,
    describeLlmCallSuccess,
} from './llm-call-log.util';
import type { LlmCircuitBreakerService } from './llm-circuit-breaker.service';
import { describeLlmError, isTransientLlmError } from './llm-error.util';
import {
    LlmProviderPausedError,
    type LlmProviderFailure,
} from './llm-unavailable.error';
import type {
    LlmProviderCode,
    LlmSendGuard,
    StructuredLlmAdapter,
    StructuredLlmRequest,
    StructuredLlmResponse,
} from './structured-llm.types';

/** Что набралось за один вызов шлюза — для сводной ошибки, если не ответит никто. */
export interface LlmCallTrail {
    /** Почему пропущен или сорвался каждый поставщик — текст сводной ошибки. */
    notes: string[];
    /** Сорвавшиеся вызовы по порядку попыток — для «временный ли отказ». */
    failures: LlmProviderFailure[];
}

/**
 * Итог попытки: ответ; `paused` — поставщик встал на паузу, пока вызов ждал
 * очереди адаптера (запрос не ушёл); null — сбой поставщика.
 */
export type LlmAttemptOutcome = StructuredLlmResponse | 'paused' | null;

/**
 * Вызовы поставщиков внутри шлюза: журнал с замером, учёт в предохранителе,
 * проверка паузы перед отправкой и проба поставщика на паузе — одна за раз.
 * Вынесено из StructuredLlmGateway по лимиту файла (11.11.2026); не
 * @Injectable — шлюз создаёт его сам и отдаёт свой логгер, чтобы журнал
 * остался под именем шлюза.
 */
export class LlmProviderCalls {
    constructor(
        private readonly breaker: LlmCircuitBreakerService,
        private readonly logger: Logger,
    ) {}

    /**
     * Обычная попытка. Адаптер с очередью (VibeCode) перед отправкой
     * перепроверяет паузу: пока вызов ждал слота, поставщик мог встать на
     * паузу — тогда запрос не уходит, итог `paused`, и шлюз идёт дальше, а
     * не ждёт таймаут у зависшего поставщика. `fallbackAvailable` — в
     * порядке остался кто-то ещё: пауза предохранителя тогда помечается
     * «повтор», а не тревогой.
     */
    attempt(
        adapter: StructuredLlmAdapter,
        request: StructuredLlmRequest,
        trail: LlmCallTrail,
        fallbackAvailable: boolean,
    ): Promise<LlmAttemptOutcome> {
        return this.call(adapter, request, trail, fallbackAvailable, {
            beforeSend: () => this.assertNotPaused(adapter.code),
        });
    }

    /**
     * Проба поставщика на паузе — когда больше никто не ответил: попытка
     * лучше гарантированного отказа, а удача снимет паузу. Проба одна за раз
     * на все реплики; занята — вызова нет, в trail «проба уже идёт», и вызов
     * дозаполнит догон, когда поставщик снова ответит.
     */
    async probe(
        adapter: StructuredLlmAdapter,
        request: StructuredLlmRequest,
        trail: LlmCallTrail,
        fallbackAvailable: boolean,
    ): Promise<StructuredLlmResponse | null> {
        if (!(await this.breaker.tryStartProbe(adapter.code))) {
            trail.notes.push(
                `${adapter.code} — на паузе, пробный вызов уже идёт`,
            );
            trail.failures.push({ provider: adapter.code, transient: true });
            return null;
        }
        try {
            const outcome = await this.call(
                adapter,
                request,
                trail,
                fallbackAvailable,
            );
            return outcome === 'paused' ? null : outcome;
        } finally {
            await this.breaker.endProbe(adapter.code);
        }
    }

    /**
     * Каждый вызов оставляет строку журнала с замером (11.11.2026): удача —
     * время ответа, ожидание слота, вход и токены; сбой — через сколько мс.
     * Сбой дописывается в trail; временный считается в предохранителе.
     */
    private async call(
        adapter: StructuredLlmAdapter,
        request: StructuredLlmRequest,
        trail: LlmCallTrail,
        fallbackAvailable: boolean,
        guard?: LlmSendGuard,
    ): Promise<LlmAttemptOutcome> {
        const startedAt = Date.now();
        try {
            const response = await adapter.complete(request, guard);
            const elapsedMs = Date.now() - startedAt;
            await this.breaker.recordSuccess(adapter.code);
            this.logger.log(
                describeLlmCallSuccess(
                    request,
                    adapter.code,
                    response,
                    elapsedMs,
                ),
            );
            return response;
        } catch (error) {
            const failedAt = Date.now();
            if (error instanceof LlmProviderPausedError) {
                trail.notes.push(
                    `${adapter.code} — встал на паузу, пока вызов ждал очереди`,
                );
                this.logger.warn(
                    `LLM ${adapter.code} ${request.schemaName} (${request.domain}): запрос не отправлен — ` +
                        `поставщик встал на паузу, пока вызов ждал очереди ${failedAt - startedAt} мс`,
                );
                return 'paused';
            }
            const text = describeLlmError(error);
            const transient = isTransientLlmError(error);
            trail.notes.push(`${adapter.code} — ${text}`);
            trail.failures.push({ provider: adapter.code, transient });
            if (transient) {
                await this.breaker.recordFailure(
                    adapter.code,
                    text,
                    failedAt,
                    fallbackAvailable,
                );
            }
            this.logger.warn(
                describeLlmCallFailure(
                    request,
                    adapter.code,
                    text,
                    failedAt - startedAt,
                ),
            );
            return null;
        }
    }

    private async assertNotPaused(provider: LlmProviderCode): Promise<void> {
        if (await this.breaker.isOpen(provider)) {
            throw new LlmProviderPausedError(provider);
        }
    }
}
