import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import { LlmGatewaySettingsService } from './llm-gateway-settings.service';
import type { LlmProviderCode } from './structured-llm.types';

const KEY_PREFIX = 'llm-gateway:circuit';

/**
 * Сколько живёт замок пробного вызова, если процесс упал, не сняв его:
 * проба — это ожидание своей очереди и до пяти минут ответа модели.
 */
const PROBE_LOCK_TTL_SEC = 600;

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
 * все реплики (SET NX). Пороги — из админки (LlmGatewaySettingsService),
 * читаются на каждом сбое: новое значение действует без перезапуска.
 *
 * Пробный вызов поставщика на паузе (когда больше никто не ответил) идёт
 * один за раз на все реплики — tryStartProbe / endProbe (11.11.2026). Без
 * замка каждый разбор, у которого не ответил и запасной, сам становился
 * пробой: волна запросов к зависшему поставщику, каждый до таймаута, и пул
 * очереди разборов стоял.
 */
@Injectable()
export class LlmCircuitBreakerService {
    private readonly logger = new Logger(LlmCircuitBreakerService.name);
    private readonly memory = new Map<LlmProviderCode, MemoryState>();
    /** Пробы без Redis — в памяти процесса. */
    private readonly probing = new Set<LlmProviderCode>();

    constructor(
        private readonly settings: LlmGatewaySettingsService,
        private readonly redisService: RedisService,
    ) {}

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

    /**
     * Временный сбой: в окне набралось `failures` — пауза на `cooldownSec`
     * с телеграмом. Тревога помечается тем, осталось ли кому отвечать
     * (политика владельца 10.11.2026: не глушить сообщения, а размечать —
     * «повтор» против «попытки исчерпаны»): пауза при живом запасном — это
     * «работа идёт», а пауза последнего поставщика — настоящая тревога.
     */
    async recordFailure(
        provider: LlmProviderCode,
        reason: string,
        now: number = Date.now(),
        fallbackAvailable = true,
    ): Promise<void> {
        const options = await this.settings.circuit();
        const count = await this.incrementFailures(
            provider,
            now,
            options.windowSec,
        );
        if (count < options.failures) return;
        const openedByUs = await this.open(provider, now, options.cooldownSec);
        if (!openedByUs) return;
        const head = fallbackAvailable
            ? `Повтор: провайдер LLM ${provider} отключён`
            : `ПОПЫТКИ ИСЧЕРПАНЫ: провайдер LLM ${provider} отключён, запасных нет`;
        const tail = fallbackAvailable
            ? ' — работа идёт через запасного'
            : ' — разборы и отчёты встанут до конца паузы';
        this.logger.error(
            `${head} на ${Math.round(options.cooldownSec / 60)} мин: ` +
                `${count} временных сбоев за ${Math.round(options.windowSec / 60)} мин ` +
                `(последний: ${reason})${tail}`,
            { telegram: true },
        );
    }

    /**
     * Занять пробный вызов поставщика на паузе: true — проба наша, после
     * вызова обязательно endProbe; false — пробу уже ведёт другой вызов
     * (любой реплики). Ошибка Redis — замок в памяти процесса.
     */
    async tryStartProbe(provider: LlmProviderCode): Promise<boolean> {
        const redis = this.safeClient();
        if (redis) {
            try {
                const set = await redis.set(
                    this.probeKey(provider),
                    '1',
                    'EX',
                    PROBE_LOCK_TTL_SEC,
                    'NX',
                );
                return set !== null;
            } catch (error) {
                this.warnRedis(error);
            }
        }
        if (this.probing.has(provider)) return false;
        this.probing.add(provider);
        return true;
    }

    /** Снять замок пробы — и после ответа, и после сбоя. */
    async endProbe(provider: LlmProviderCode): Promise<void> {
        this.probing.delete(provider);
        const redis = this.safeClient();
        if (!redis) return;
        try {
            await redis.del(this.probeKey(provider));
        } catch (error) {
            this.warnRedis(error);
        }
    }

    private async incrementFailures(
        provider: LlmProviderCode,
        now: number,
        windowSec: number,
    ): Promise<number> {
        const redis = this.safeClient();
        if (redis) {
            try {
                const key = this.failuresKey(provider);
                const count = await redis.incr(key);
                if (count === 1) await redis.expire(key, windowSec);
                return count;
            } catch (error) {
                this.warnRedis(error);
            }
        }
        const state = this.state(provider);
        const windowMs = windowSec * 1000;
        state.failedAt = state.failedAt.filter(at => now - at < windowMs);
        state.failedAt.push(now);
        return state.failedAt.length;
    }

    /** Поставить на паузу; true — это сделали мы (алерт один на все реплики). */
    private async open(
        provider: LlmProviderCode,
        now: number,
        cooldownSec: number,
    ): Promise<boolean> {
        const redis = this.safeClient();
        if (redis) {
            try {
                const set = await redis.set(
                    this.openKey(provider),
                    String(now),
                    'EX',
                    cooldownSec,
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
        state.openUntil = now + cooldownSec * 1000;
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

    private probeKey(provider: LlmProviderCode): string {
        return `${KEY_PREFIX}:${provider}:probe`;
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
}
