import type { RedisService } from '@/core/redis/redis.service';
import { CallReviewRateLimiter } from '../call-review-rate-limit';

/** Redis в памяти: INCR, TTL, EXPIRE — сколько нужно счётчику. */
function redisOf() {
    const counts = new Map<string, number>();
    const ttls = new Map<string, number>();
    const client = {
        incr: jest.fn((key: string) => {
            const next = (counts.get(key) ?? 0) + 1;
            counts.set(key, next);
            return Promise.resolve(next);
        }),
        ttl: jest.fn((key: string) => Promise.resolve(ttls.get(key) ?? -1)),
        expire: jest.fn((key: string, seconds: number) => {
            ttls.set(key, seconds);
            return Promise.resolve(1);
        }),
    };
    const redis = { getClient: () => client };
    return { redis: redis as unknown as RedisService, client, counts };
}

describe('CallReviewRateLimiter', () => {
    it('10 сохранений в минуту по ключу — можно, 11-е — нет', async () => {
        const { redis, client } = redisOf();
        const limiter = new CallReviewRateLimiter(redis);

        const results: boolean[] = [];
        for (let i = 0; i < 11; i += 1) {
            results.push(await limiter.tryConsume('lead-key'));
        }

        expect(results.slice(0, 10).every(Boolean)).toBe(true);
        expect(results[10]).toBe(false);
        expect(client.expire).toHaveBeenCalledTimes(1);
        expect(client.expire).toHaveBeenCalledWith(expect.any(String), 60);
    });

    it('счётчик у каждого ключа свой; в Redis — хэш, не сам ключ', async () => {
        const { redis, counts } = redisOf();
        const limiter = new CallReviewRateLimiter(redis);
        for (let i = 0; i < 10; i += 1) await limiter.tryConsume('first');

        expect(await limiter.tryConsume('second')).toBe(true);
        expect([...counts.keys()].some(key => key.includes('first'))).toBe(
            false,
        );
    });

    it('Redis недоступен — сохранение не блокируется', async () => {
        const redis = {
            getClient: () => ({
                incr: () => Promise.reject(new Error('нет связи')),
            }),
        };
        const limiter = new CallReviewRateLimiter(
            redis as unknown as RedisService,
        );
        expect(await limiter.tryConsume('lead-key')).toBe(true);
    });
});
