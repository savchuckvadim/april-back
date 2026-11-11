import { randomUUID } from 'node:crypto';
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
 * Итог попытки: ответ; `paused` — запрос не ушёл, поставщик на паузе (встал
 * на паузу, пока вызов ждал очереди, или проба уже идёт); null — сбой
 * поставщика.
 */
export type LlmAttemptOutcome = StructuredLlmResponse | 'paused' | null;

/** Проверка перед отправкой: бросает LlmProviderPausedError — не отправлять. */
type SendCheck = () => Promise<void>;

const PAUSED_NOTES: Record<LlmProviderPausedError['reason'], string> = {
    paused: 'встал на паузу, пока вызов ждал очереди',
    'probe-busy': 'на паузе, пробный вызов уже идёт',
};

/**
 * Вызовы поставщиков внутри шлюза: журнал с замером, учёт в предохранителе,
 * проверка паузы у самой отправки и проба поставщика на паузе — одна за
 * раз. Проверки идут через LlmSendGuard: адаптер зовёт её прямо перед
 * отправкой запроса (адаптер с очередью — когда дождался слота), поэтому
 * и пауза, и замок пробы видны на момент отправки, а не постановки в
 * очередь. Вынесено из StructuredLlmGateway по лимиту файла (11.11.2026);
 * не @Injectable — шлюз создаёт его сам и отдаёт свой логгер, чтобы журнал
 * остался под именем шлюза.
 */
export class LlmProviderCalls {
    constructor(
        private readonly breaker: LlmCircuitBreakerService,
        private readonly logger: Logger,
    ) {}

    /**
     * Обычная попытка. Пока вызов ждал слота, поставщик мог встать на
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
        return this.call(adapter, request, trail, fallbackAvailable, () =>
            this.assertNotPaused(adapter.code),
        );
    }

    /**
     * Проба поставщика на паузе — когда больше никто не ответил: попытка
     * лучше гарантированного отказа, а удача снимет паузу. У отправки:
     * пауза уже кончилась — обычный запрос без замка; иначе замок пробы с
     * маркером — одна проба за раз на все реплики, занят — запрос не уходит
     * («проба уже идёт»), и звонок дозаполнит догон. Замок держится только
     * на время ответа и снимается своим маркером.
     */
    async probe(
        adapter: StructuredLlmAdapter,
        request: StructuredLlmRequest,
        trail: LlmCallTrail,
        fallbackAvailable: boolean,
    ): Promise<StructuredLlmResponse | null> {
        const lock = { token: randomUUID(), held: false };
        try {
            const outcome = await this.call(
                adapter,
                request,
                trail,
                fallbackAvailable,
                async () => {
                    if (!(await this.breaker.isOpen(adapter.code))) return;
                    lock.held = await this.breaker.tryStartProbe(
                        adapter.code,
                        lock.token,
                    );
                    if (!lock.held) {
                        throw new LlmProviderPausedError(
                            adapter.code,
                            'probe-busy',
                        );
                    }
                },
            );
            return outcome === 'paused' ? null : outcome;
        } finally {
            if (lock.held)
                await this.breaker.endProbe(adapter.code, lock.token);
        }
    }

    /**
     * Каждый вызов оставляет строку журнала с замером (11.11.2026): удача —
     * время ответа, ожидание слота, вход и токены; сбой — сколько поставщик
     * молчал после отправки и сколько вызов ждал слота. Сбой дописывается в
     * trail; временный считается в предохранителе.
     */
    private async call(
        adapter: StructuredLlmAdapter,
        request: StructuredLlmRequest,
        trail: LlmCallTrail,
        fallbackAvailable: boolean,
        check: SendCheck,
    ): Promise<LlmAttemptOutcome> {
        const startedAt = Date.now();
        // Объект, а не let: отметку ставит замыкание проверки, а сужение
        // типа let TypeScript через замыкания не видит.
        const timing: { sentAt: number | null } = { sentAt: null };
        const guard: LlmSendGuard = {
            beforeSend: async () => {
                await check();
                timing.sentAt = Date.now();
            },
        };
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
                const note = PAUSED_NOTES[error.reason];
                trail.notes.push(`${adapter.code} — ${note}`);
                trail.failures.push({
                    provider: adapter.code,
                    transient: true,
                    paused: true,
                });
                this.logger.warn(
                    `LLM ${adapter.code} ${request.schemaName} (${request.domain}): запрос не отправлен — ` +
                        `поставщик ${note} (ждал ${failedAt - startedAt} мс)`,
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
            const queueMs =
                timing.sentAt === null ? 0 : timing.sentAt - startedAt;
            this.logger.warn(
                describeLlmCallFailure(
                    request,
                    adapter.code,
                    text,
                    failedAt - startedAt,
                    queueMs,
                ),
            );
            return null;
        }
    }

    private async assertNotPaused(provider: LlmProviderCode): Promise<void> {
        if (await this.breaker.isOpen(provider)) {
            throw new LlmProviderPausedError(provider, 'paused');
        }
    }
}
