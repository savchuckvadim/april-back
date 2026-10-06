import { RedisService } from '@/core/redis/redis.service';
import {
    BITRIX_CALL_CLASS,
    runAsBackground,
    runAsInteractive,
} from '../../context/bitrix-call-context';
import {
    RATE_LIMIT_CLASS_POLICIES,
    resolveClassLimit,
    resolveRateLimitRules,
} from '../bitrix-rate-limiter.config';
import {
    BitrixRateLimitTimeoutError,
    BitrixRateLimiterService,
} from '../bitrix-rate-limiter.service';

/**
 * Приоритет менеджеров в ограничителе (решение владельца, 05.10.2026):
 * фон берёт слоты только из своей доли ведра и мимо очереди не ходит,
 * менеджеру доступно всё ведро, и ждать вечно он не должен.
 */

const DOMAIN = 'portal.bitrix24.ru';

/** Redis с журналом вызовов скрипта: [ключ, время, предел, скорость]. */
const makeRedis = (next: () => number) => {
    const evalMock = jest.fn((...args: unknown[]) => {
        void args;
        return Promise.resolve(next());
    });
    const redis = {
        getClient: () => ({ eval: evalMock }),
    } as unknown as RedisService;
    /** Пределы счётчика, с которыми вызывался скрипт. */
    const limits = (): number[] =>
        evalMock.mock.calls.map(call => Number(call[4]));
    return { redis, evalMock, limits };
};

describe('BitrixRateLimiterService: приоритет менеджеров', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('менеджеру доступно всё ведро, фону — только его доля', async () => {
        const { redis, limits } = makeRedis(() => 0);
        const service = new BitrixRateLimiterService(redis);

        await runAsInteractive('test', () => service.acquire(DOMAIN));
        await runAsBackground('test', () => service.acquire(DOMAIN));

        expect(limits()).toEqual([50, 30]);
    });

    it('вызов без разметки считается фоновым — забытая метка не отнимает место у менеджеров', async () => {
        const { redis, limits } = makeRedis(() => 0);
        const service = new BitrixRateLimiterService(redis);

        await service.acquire(DOMAIN);

        expect(limits()).toEqual([30]);
    });

    it('доля фона — из настроек портала', async () => {
        const { redis, limits } = makeRedis(() => 0);
        const service = new BitrixRateLimiterService(redis);

        await runAsBackground('test', () =>
            service.acquire(DOMAIN, undefined, { backgroundShare: 0.8 }),
        );

        expect(limits()).toEqual([40]);
    });

    it('доля больше 100% — ошибка ввода: действует значение по умолчанию', async () => {
        const { redis, limits } = makeRedis(() => 0);
        const service = new BitrixRateLimiterService(redis);

        await runAsBackground('test', () =>
            service.acquire(DOMAIN, undefined, { backgroundShare: 5 }),
        );

        expect(limits()).toEqual([30]);
    });

    it('тариф «энтерпрайз» из настроек портала — ведро 250, фону 150', async () => {
        const { redis, limits } = makeRedis(() => 0);
        const service = new BitrixRateLimiterService(redis);

        await runAsInteractive('test', () =>
            service.acquire(DOMAIN, undefined, { plan: 'enterprise' }),
        );
        await runAsBackground('test', () =>
            service.acquire(DOMAIN, undefined, { plan: 'enterprise' }),
        );

        expect(limits()).toEqual([250, 150]);
    });

    it('менеджер не дождался слота — запрос уходит без него, а не падает', async () => {
        const { redis, evalMock } = makeRedis(() => 500);
        const service = new BitrixRateLimiterService(redis);

        const pending = runAsInteractive('test', () => service.acquire(DOMAIN));
        await jest.advanceTimersByTimeAsync(
            RATE_LIMIT_CLASS_POLICIES[BITRIX_CALL_CLASS.interactive].maxWaitMs +
                2_000,
        );

        await expect(pending).resolves.toBeUndefined();
        expect(evalMock.mock.calls.length).toBeGreaterThan(1);
    });

    it('фон не дождался слота — отказ, мимо очереди фон не ходит', async () => {
        const { redis } = makeRedis(() => 5_000);
        const service = new BitrixRateLimiterService(redis);

        const pending = runAsBackground('deal-audit', () =>
            service.acquire(DOMAIN, undefined, { backgroundMaxWaitMs: 10_000 }),
        );
        const assertion = expect(pending).rejects.toBeInstanceOf(
            BitrixRateLimitTimeoutError,
        );
        await jest.advanceTimersByTimeAsync(15_000);
        await assertion;
    });

    it('в отказе фону названы портал, источник и время ожидания', async () => {
        const { redis } = makeRedis(() => 5_000);
        const service = new BitrixRateLimiterService(redis);

        const pending = runAsBackground('deal-audit', () =>
            service.acquire(DOMAIN, undefined, { backgroundMaxWaitMs: 4_000 }),
        ).catch((error: unknown) => error);
        await jest.advanceTimersByTimeAsync(8_000);
        const error = (await pending) as BitrixRateLimitTimeoutError;

        expect(error.domain).toBe(DOMAIN);
        expect(error.source).toBe('deal-audit');
        expect(error.callClass).toBe(BITRIX_CALL_CLASS.background);
        expect(error.waitedMs).toBeGreaterThanOrEqual(4_000);
    });

    it('слот освободился раньше расчётного — ждущий забирает его на перепроверке', async () => {
        // Скрипт насчитал фону 10 с, но менеджеры освободили место через
        // пару секунд: спим не дольше двух и перепроверяем.
        const waits = [10_000, 10_000, 0];
        const { redis, evalMock } = makeRedis(() => waits.shift() ?? 0);
        const service = new BitrixRateLimiterService(redis);

        const pending = runAsBackground('test', () => service.acquire(DOMAIN));
        await jest.advanceTimersByTimeAsync(5_000);

        await expect(pending).resolves.toBeUndefined();
        expect(evalMock).toHaveBeenCalledTimes(3);
    });
});

describe('resolveClassLimit', () => {
    it('доля ведра — целое, не меньше одного слота и не больше ёмкости', () => {
        expect(resolveClassLimit(50, 1)).toBe(50);
        expect(resolveClassLimit(50, 0.6)).toBe(30);
        expect(resolveClassLimit(250, 0.6)).toBe(150);
        expect(resolveClassLimit(50, 0.001)).toBe(1);
        expect(resolveClassLimit(50, 3)).toBe(50);
        expect(resolveClassLimit(50, Number.NaN)).toBe(50);
    });
});

describe('resolveRateLimitRules', () => {
    it('без настроек портала — значения по умолчанию', () => {
        const rules = resolveRateLimitRules();

        expect(rules.config).toEqual({ capacity: 50, ratePerSec: 2 });
        expect(rules.policies[BITRIX_CALL_CLASS.background].share).toBe(0.6);
    });

    it('портал выключил очередь — правила это несут, по умолчанию включена', () => {
        expect(resolveRateLimitRules().enabled).toBe(true);
        expect(resolveRateLimitRules({ enabled: false }).enabled).toBe(false);
    });

    it('энтерпрайз из настроек портала — ведро 250 и 5 в секунду', () => {
        expect(resolveRateLimitRules({ plan: 'enterprise' }).config).toEqual({
            capacity: 250,
            ratePerSec: 5,
        });
    });

    it('неизвестный тариф — тариф по умолчанию', () => {
        const rules = resolveRateLimitRules({
            plan: 'vip' as never,
        });

        expect(rules.config.capacity).toBe(50);
    });

    it('опечатка в сроке ожидания не вешает запросы: потолки 2 и 60 минут', () => {
        const rules = resolveRateLimitRules({
            interactiveMaxWaitMs: 10_000_000,
            backgroundMaxWaitMs: 99_000_000,
        });

        expect(rules.policies[BITRIX_CALL_CLASS.interactive].maxWaitMs).toBe(
            120_000,
        );
        expect(rules.policies[BITRIX_CALL_CLASS.background].maxWaitMs).toBe(
            3_600_000,
        );
    });

    it('ноль и минус — значения по умолчанию', () => {
        const rules = resolveRateLimitRules({
            backgroundShare: 0,
            interactiveMaxWaitMs: -1,
        });

        expect(rules.policies[BITRIX_CALL_CLASS.background].share).toBe(0.6);
        expect(rules.policies[BITRIX_CALL_CLASS.interactive].maxWaitMs).toBe(
            15_000,
        );
    });
});
