import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@/core/redis/redis.service';
import {
    BitrixPlanKey,
    RATE_LIMIT_PLAN_CONFIGS,
    RateLimitPlanConfig,
} from './bitrix-rate-limiter.config';

/**
 * Leaky Bucket алгоритм — атомарный через Lua.
 * KEYS[1] — Redis-ключ домена
 * ARGV[1] — текущее время в мс
 * ARGV[2] — ёмкость ведра (capacity)
 * ARGV[3] — скорость дренажа за мс (ratePerSec / 1000)
 * Возвращает: 0 если слот выдан, иначе — мс ожидания
 */
const LEAKY_BUCKET_SCRIPT = `
local key      = KEYS[1]
local now      = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local rate     = tonumber(ARGV[3])

local data  = redis.call('HMGET', key, 'count', 'ts')
local count = tonumber(data[1]) or 0
local ts    = tonumber(data[2]) or now

local elapsed = now - ts
if elapsed < 0 then elapsed = 0 end

local new_count = count - elapsed * rate
if new_count < 0 then new_count = 0 end

if new_count < capacity then
    new_count = new_count + 1
    redis.call('HMSET', key, 'count', tostring(new_count), 'ts', tostring(now))
    redis.call('PEXPIRE', key, 60000)
    return 0
else
    return math.ceil((new_count - capacity + 1) / rate)
end
`;

const MAX_RETRY_ATTEMPTS = 20;

@Injectable()
export class BitrixRateLimiterService {
    private readonly logger = new Logger(BitrixRateLimiterService.name);
    private readonly enabled: boolean;
    private readonly config: RateLimitPlanConfig;

    constructor(
        private readonly redis: RedisService,
        configService: ConfigService,
    ) {
        this.enabled =
            configService.get<string>('BITRIX_RATE_LIMIT_ENABLED') === 'true';

        const plan =
            (configService.get<string>('BITRIX_PLAN') as BitrixPlanKey) ??
            'regular';

        this.config =
            RATE_LIMIT_PLAN_CONFIGS[plan] ?? RATE_LIMIT_PLAN_CONFIGS.regular;

        if (this.enabled) {
            this.logger.log(
                `Включён: план=${plan}, capacity=${this.config.capacity}, rate=${this.config.ratePerSec}/сек`,
            );
        } else {
            this.logger.log('Отключён — работает в режиме passthrough');
        }
    }

    /**
     * Ждёт пока Leaky Bucket не выдаст токен для домена.
     * Если BITRIX_RATE_LIMIT_ENABLED != 'true' — возвращается мгновенно.
     */
    async acquire(domain: string): Promise<void> {
        if (!this.enabled) return;

        const key = `bitrix:rate:${domain}`;
        const ratePerMs = this.config.ratePerSec / 1000;

        for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
            const waitMs = await this.evalScript(key, ratePerMs);
            if (waitMs <= 0) return;

            this.logger.debug(
                `[${domain}] ожидание ${waitMs}мс (попытка ${attempt + 1})`,
            );
            await this.sleep(waitMs);
        }

        this.logger.warn(
            `[${domain}] превышен лимит попыток rate limiter, пропускаем`,
        );
    }

    private async evalScript(key: string, ratePerMs: number): Promise<number> {
        try {
            const result = await this.redis
                .getClient()
                .eval(
                    LEAKY_BUCKET_SCRIPT,
                    1,
                    key,
                    Date.now().toString(),
                    this.config.capacity.toString(),
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
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
