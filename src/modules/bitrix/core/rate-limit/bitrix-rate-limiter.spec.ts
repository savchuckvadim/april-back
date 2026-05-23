import { BitrixRateLimiterService } from './bitrix-rate-limiter.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../../core/redis/redis.service';

const makeRedis = (evalResult: number | (() => number)): RedisService => {
    const evalFn =
        typeof evalResult === 'function' ? evalResult : () => evalResult;
    return {
        getClient: () => ({
            eval: jest.fn().mockImplementation(() => Promise.resolve(evalFn())),
        }),
    } as unknown as RedisService;
};

const makeConfig = (enabled: boolean, plan = 'regular'): ConfigService =>
    ({
        get: (key: string) => {
            if (key === 'BITRIX_RATE_LIMIT_ENABLED')
                return enabled ? 'true' : 'false';
            if (key === 'BITRIX_PLAN') return plan;
            return undefined;
        },
    }) as unknown as ConfigService;

describe('BitrixRateLimiterService', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    describe('disabled mode', () => {
        it('возвращается мгновенно без вызова Redis', async () => {
            const redis = makeRedis(0);
            const evalFn = redis.getClient().eval as jest.Mock;
            const service = new BitrixRateLimiterService(
                redis,
                makeConfig(false),
            );

            await service.acquire('test.bitrix24.ru');

            expect(evalFn).not.toHaveBeenCalled();
        });
    });

    describe('enabled mode', () => {
        it('возвращается сразу если Redis вернул 0', async () => {
            const redis = makeRedis(0);
            const service = new BitrixRateLimiterService(
                redis,
                makeConfig(true),
            );

            await expect(
                service.acquire('portal.bitrix24.ru'),
            ).resolves.toBeUndefined();
        });

        it('ждёт и делает retry если Redis вернул waitMs > 0', async () => {
            let callCount = 0;
            const redis = makeRedis(() => {
                callCount++;
                return callCount < 3 ? 500 : 0;
            });

            const service = new BitrixRateLimiterService(
                redis,
                makeConfig(true),
            );

            const acquirePromise = service.acquire('portal.bitrix24.ru');

            await jest.runAllTimersAsync();
            await acquirePromise;

            expect(callCount).toBe(3);
        });

        it('разные домены не влияют друг на друга — Redis вызывается с разными ключами', async () => {
            const evalMock = jest.fn().mockResolvedValue(0);
            const redis = {
                getClient: () => ({ eval: evalMock }),
            } as unknown as RedisService;

            const service = new BitrixRateLimiterService(
                redis,
                makeConfig(true),
            );

            await service.acquire('portal-a.bitrix24.ru');
            await service.acquire('portal-b.bitrix24.ru');

            const keys = evalMock.mock.calls.map((args: unknown[]) => args[2]);
            expect(keys).toContain('bitrix:rate:portal-a.bitrix24.ru');
            expect(keys).toContain('bitrix:rate:portal-b.bitrix24.ru');
        });

        it('при ошибке Redis пропускает запрос без исключения', async () => {
            const redis = {
                getClient: () => ({
                    eval: jest
                        .fn()
                        .mockRejectedValue(new Error('Connection refused')),
                }),
            } as unknown as RedisService;

            const service = new BitrixRateLimiterService(
                redis,
                makeConfig(true),
            );

            await expect(
                service.acquire('portal.bitrix24.ru'),
            ).resolves.toBeUndefined();
        });

        it('использует enterprise конфиг при BITRIX_PLAN=enterprise', () => {
            const redis = makeRedis(0);
            const service = new BitrixRateLimiterService(
                redis,
                makeConfig(true, 'enterprise'),
            );

            // @ts-expect-error accessing private for test
            expect(service.config.capacity).toBe(250);
            // @ts-expect-error accessing private for test
            expect(service.config.ratePerSec).toBe(5);
        });

        it('fallback на regular конфиг при неизвестном плане', () => {
            const redis = makeRedis(0);
            const service = new BitrixRateLimiterService(
                redis,
                makeConfig(true, 'unknown_plan'),
            );

            // @ts-expect-error accessing private for test
            expect(service.config.capacity).toBe(50);
        });
    });
});
