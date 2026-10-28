import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@lib/core/redis/redis.service';
import type { LlmProviderCode } from './structured-llm.types';

/** Пороги предохранителя (env LLM_CIRCUIT_FAILURES / _WINDOW_SEC / _COOLDOWN_SEC). */
export interface LlmCircuitOptions {
    /** Сколько временных сбоев в окне отключают провайдера. */
    failures: number;
    /** Окно счёта сбоев, секунд. */
    windowSec: number;
    /** На сколько отключаем, секунд; потом одна пробная попытка. */
    cooldownSec: number;
}

export const LLM_CIRCUIT_DEFAULTS: LlmCircuitOptions = {
    failures: 5,
    windowSec: 600,
    cooldownSec: 300,
};

const KEY_PREFIX = 'llm-gateway:circuit';

interface MemoryState {
    failedAt: number[];
    openUntil: number;
}

/**
 * Предохранитель провайдера LLM: серия временных сбоев (5xx/429/сеть) в
 * окне отключает провайдера на паузу — шлюз сразу идёт к запасному, а не
 * ждёт таймаут на каждом звонке. Состояние в Redis (реплик несколько), без
 * Redis — в памяти процесса; любая ошибка Redis — провайдер считается
 * включённым (деградация в сторону «попробовать», а не «заклинить»).
 * Переходы «отключён» / «снова отвечает» уходят в телеграм один раз на
 * все реплики (SET NX).
 */
@Injectable()
export class LlmCircuitBreakerService {
    private readonly logger = new Logger(LlmCircuitBreakerService.name);
    readonly options: LlmCircuitOptions;
    private readonly memory = new Map<LlmProviderCode, MemoryState>();

    constructor(
        private readonly configService: ConfigService,
        private readonly redisService: RedisService,
    ) {
        this.options = {
            failures: this.numberSetting(
                'LLM_CIRCUIT_FAILURES',
                LLM_CIRCUIT_DEFAULTS.failures,
            ),
            windowSec: this.numberSetting(
                'LLM_CIRCUIT_WINDOW_SEC',
                LLM_CIRCUIT_DEFAULTS.windowSec,
            ),
            cooldownSec: this.numberSetting(
                'LLM_CIRCUIT_COOLDOWN_SEC',
                LLM_CIRCUIT_DEFAULTS.cooldownSec,
            ),
        };
    }

    /** Провайдер на паузе после серии сбоев. */
    async isOpen(
        provider: LlmProviderCode,
        now: number = Date.now(),
    ): Promise<boolean> {
        const redis = this.safeClient();
        if (redis) {
            try {
                return (await redis.exists(this.openKey(provider))) > 0;
            } catch (error) {
                this.warnRedis(error);
            }
        }
        return this.state(provider).openUntil > now;
    }

    /** Удачный ответ: серия сбоев обнуляется; был на паузе — сообщаем, что ожил. */
    async recordSuccess(
        provider: LlmProviderCode,
        now: number = Date.now(),
    ): Promise<void> {
        const wasOpen = await this.isOpen(provider, now);
        const redis = this.safeClient();
        if (redis) {
            try {
                await redis.del(
                    this.failuresKey(provider),
                    this.openKey(provider),
                );
            } catch (error) {
                this.warnRedis(error);
            }
        }
        this.memory.delete(provider);
        if (wasOpen) {
            this.logger.warn(
                `Провайдер LLM ${provider} снова отвечает — включён`,
                {
                    telegram: true,
                },
            );
        }
    }

    /** Временный сбой: в окне набралось `failures` — пауза на `cooldownSec` с телеграмом. */
    async recordFailure(
        provider: LlmProviderCode,
        reason: string,
        now: number = Date.now(),
    ): Promise<void> {
        const count = await this.incrementFailures(provider, now);
        if (count < this.options.failures) return;
        const openedByUs = await this.open(provider, now);
        if (!openedByUs) return;
        this.logger.error(
            `Провайдер LLM ${provider} отключён на ${Math.round(this.options.cooldownSec / 60)} мин: ` +
                `${count} временных сбоев за ${Math.round(this.options.windowSec / 60)} мин (последний: ${reason})`,
            { telegram: true },
        );
    }

    private async incrementFailures(
        provider: LlmProviderCode,
        now: number,
    ): Promise<number> {
        const redis = this.safeClient();
        if (redis) {
            try {
                const key = this.failuresKey(provider);
                const count = await redis.incr(key);
                if (count === 1)
                    await redis.expire(key, this.options.windowSec);
                return count;
            } catch (error) {
                this.warnRedis(error);
            }
        }
        const state = this.state(provider);
        const windowMs = this.options.windowSec * 1000;
        state.failedAt = state.failedAt.filter(at => now - at < windowMs);
        state.failedAt.push(now);
        return state.failedAt.length;
    }

    /** Поставить на паузу; true — это сделали мы (алерт один на все реплики). */
    private async open(
        provider: LlmProviderCode,
        now: number,
    ): Promise<boolean> {
        const redis = this.safeClient();
        if (redis) {
            try {
                const set = await redis.set(
                    this.openKey(provider),
                    String(now),
                    'EX',
                    this.options.cooldownSec,
                    'NX',
                );
                await redis
                    .del(this.failuresKey(provider))
                    .catch(() => undefined);
                return set !== null;
            } catch (error) {
                this.warnRedis(error);
            }
        }
        const state = this.state(provider);
        const wasOpen = state.openUntil > now;
        state.openUntil = now + this.options.cooldownSec * 1000;
        state.failedAt = [];
        return !wasOpen;
    }

    private state(provider: LlmProviderCode): MemoryState {
        let state = this.memory.get(provider);
        if (!state) {
            state = { failedAt: [], openUntil: 0 };
            this.memory.set(provider, state);
        }
        return state;
    }

    private failuresKey(provider: LlmProviderCode): string {
        return `${KEY_PREFIX}:${provider}:failures`;
    }

    private openKey(provider: LlmProviderCode): string {
        return `${KEY_PREFIX}:${provider}:open`;
    }

    /** Redis может быть не поднят (тесты, локальный запуск) — это не ошибка. */
    private safeClient(): ReturnType<RedisService['getClient']> | null {
        try {
            return this.redisService.getClient() ?? null;
        } catch {
            return null;
        }
    }

    private warnRedis(error: unknown): void {
        this.logger.warn(
            `Состояние предохранителя LLM не прочитано из Redis (${(error as Error).message}) — считаем провайдера включённым`,
        );
    }

    private numberSetting(key: string, fallback: number): number {
        const raw = this.configService.get<string>(key);
        const value = raw === undefined || raw === '' ? NaN : Number(raw);
        return Number.isFinite(value) && value > 0 ? value : fallback;
    }
}
