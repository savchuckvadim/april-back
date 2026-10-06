import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@/core/redis/redis.service';
import {
    BITRIX_CALL_CLASS,
    BitrixCallClass,
    BitrixCallContext,
    getBitrixCallContext,
} from '../context/bitrix-call-context';
import {
    RATE_LIMIT_OUTCOME,
    observeRateLimitWait,
} from '../metrics/bitrix-metrics';
import {
    BitrixRateLimitOverrides,
    DEFAULT_BITRIX_PLAN,
    RATE_LIMIT_TIMEOUT_ACTION,
    RateLimitClassPolicy,
    resolveClassLimit,
    resolveRateLimitRules,
} from './bitrix-rate-limiter.config';

/**
 * Leaky Bucket алгоритм — атомарный через Lua.
 * KEYS[1] — Redis-ключ домена
 * ARGV[1] — текущее время в мс
 * ARGV[2] — предел счётчика для ЭТОГО вызова (у менеджеров — вся ёмкость
 *           ведра, у фона — её доля)
 * ARGV[3] — скорость дренажа за мс (ratePerSec / 1000)
 * Возвращает: 0 если слот выдан, иначе — мс ожидания
 *
 * Ведро одно на портал, счётчик общий. Приоритет получается из разных
 * пределов: фон перестаёт брать слоты, когда счётчик дошёл до его доли, а
 * менеджерам остаётся запас до полной ёмкости.
 */
const LEAKY_BUCKET_SCRIPT = `
local key   = KEYS[1]
local now   = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local rate  = tonumber(ARGV[3])

local data  = redis.call('HMGET', key, 'count', 'ts')
local count = tonumber(data[1]) or 0
local ts    = tonumber(data[2]) or now

local elapsed = now - ts
if elapsed < 0 then elapsed = 0 end

local new_count = count - elapsed * rate
if new_count < 0 then new_count = 0 end

if new_count < limit then
    new_count = new_count + 1
    redis.call('HMSET', key, 'count', tostring(new_count), 'ts', tostring(now))
    redis.call('PEXPIRE', key, 60000)
    return 0
else
    return math.ceil((new_count - limit + 1) / rate)
end
`;

/**
 * Дольше не спим за один заход: ждущий регулярно перепроверяет ведро. Фону
 * скрипт может насчитать десяток секунд — за это время менеджеры могли
 * освободить место раньше расчётного.
 */
const MAX_SLEEP_MS = 2_000;

/**
 * Случайная добавка к паузе: пришедшие одновременно получают одинаковое
 * расчётное время и без неё просыпались бы в одну и ту же миллисекунду.
 */
const SLEEP_JITTER_MS = 150;

/** Фон не дождался слота: мимо очереди он не ходит — вызывающему отказано. */
export class BitrixRateLimitTimeoutError extends Error {
    constructor(
        readonly domain: string,
        readonly callClass: BitrixCallClass,
        readonly source: string,
        readonly waitedMs: number,
    ) {
        super(
            `Битрикс ${domain}: очередь запросов занята, слот не выдан за ` +
                `${Math.round(waitedMs / 1000)} с (${callClass}, ${source})`,
        );
        this.name = 'BitrixRateLimitTimeoutError';
    }
}

@Injectable()
export class BitrixRateLimiterService {
    private readonly logger = new Logger(BitrixRateLimiterService.name);

    /**
     * Переменных окружения у ограничителя нет (06.10.2026): включение, тариф,
     * доля фона и сроки ожидания — настройки портала, они приходят в
     * {@link acquire} вместе с вызовом; не заданное — значения по умолчанию
     * из bitrix-rate-limiter.config.
     */
    constructor(private readonly redis: RedisService) {
        const rules = resolveRateLimitRules();
        const background = rules.policies[BITRIX_CALL_CLASS.background];
        this.logger.log(
            `По умолчанию: тариф ${DEFAULT_BITRIX_PLAN}, ` +
                `capacity=${rules.config.capacity}, ` +
                `rate=${rules.config.ratePerSec}/сек, фону доступно ` +
                `${resolveClassLimit(rules.config.capacity, background.share)} ` +
                `из ${rules.config.capacity}; порталы переопределяют ` +
                'в своих настройках',
        );
    }

    /**
     * Ждёт, пока Leaky Bucket не выдаст слот для домена.
     *
     * Класс вызова берётся из асинхронного контекста (менеджер или фон —
     * см. bitrix-call-context) и определяет три вещи: какая часть ведра
     * доступна, сколько ждать и что делать, если не дождались.
     *
     * Портал выключил ограничитель в своих настройках — возвращается
     * мгновенно.
     *
     * @throws BitrixRateLimitTimeoutError — фон не дождался слота.
     */
    async acquire(
        domain: string,
        context: BitrixCallContext = getBitrixCallContext(),
        overrides?: BitrixRateLimitOverrides,
    ): Promise<void> {
        const rules = resolveRateLimitRules(overrides);
        if (!rules.enabled) return;

        const { callClass, source } = context;
        const policy = rules.policies[callClass];
        const key = `bitrix:rate:${domain}`;
        const ratePerMs = rules.config.ratePerSec / 1000;
        const limit = resolveClassLimit(rules.config.capacity, policy.share);
        const startedAt = Date.now();

        for (let attempt = 1; ; attempt += 1) {
            const waitMs = await this.evalScript(key, limit, ratePerMs);
            const waitedMs = Date.now() - startedAt;

            if (waitMs <= 0) {
                observeRateLimitWait({
                    domain,
                    callClass,
                    outcome: RATE_LIMIT_OUTCOME.granted,
                    waitedMs,
                });
                return;
            }

            const remainingMs = policy.maxWaitMs - waitedMs;
            if (remainingMs <= 0) {
                this.onTimeout(domain, callClass, source, policy, waitedMs);
                return;
            }

            this.logger.debug(
                `[${domain}] ${callClass} ожидание ${waitMs}мс (попытка ${attempt})`,
            );
            await this.sleep(Math.min(waitMs, MAX_SLEEP_MS, remainingMs));
        }
    }

    /**
     * Слот не дождались. Менеджера пропускаем без слота (как и раньше —
     * отказать человеку хуже), фону отказываем: мимо очереди фон не ходит.
     */
    private onTimeout(
        domain: string,
        callClass: BitrixCallClass,
        source: string,
        policy: RateLimitClassPolicy,
        waitedMs: number,
    ): void {
        const waitedSec = Math.round(waitedMs / 1000);

        if (policy.onTimeout === RATE_LIMIT_TIMEOUT_ACTION.reject) {
            observeRateLimitWait({
                domain,
                callClass,
                outcome: RATE_LIMIT_OUTCOME.rejected,
                waitedMs,
            });
            this.logger.warn(
                `[${domain}] ${callClass} (${source}): очередь занята ` +
                    `${waitedSec} с — вызов отклонён, мимо очереди не идём`,
            );
            throw new BitrixRateLimitTimeoutError(
                domain,
                callClass,
                source,
                waitedMs,
            );
        }

        observeRateLimitWait({
            domain,
            callClass,
            outcome: RATE_LIMIT_OUTCOME.passed,
            waitedMs,
        });
        this.logger.warn(
            `[${domain}] ${callClass} (${source}): превышен лимит ожидания ` +
                `rate limiter (${waitedSec} с), пропускаем`,
        );
    }

    private async evalScript(
        key: string,
        limit: number,
        ratePerMs: number,
    ): Promise<number> {
        try {
            const result = await this.redis
                .getClient()
                .eval(
                    LEAKY_BUCKET_SCRIPT,
                    1,
                    key,
                    Date.now().toString(),
                    limit.toString(),
                    ratePerMs.toString(),
                );
            return typeof result === 'number' ? result : 0;
        } catch (err) {
            this.logger.warn(
                `Redis ошибка в rate limiter, пропускаем: ${(err as Error).message}`,
            );
            return 0;
        }
    }

    private sleep(ms: number): Promise<void> {
        const jitter = Math.floor(Math.random() * SLEEP_JITTER_MS);
        return new Promise(resolve => setTimeout(resolve, ms + jitter));
    }
}
