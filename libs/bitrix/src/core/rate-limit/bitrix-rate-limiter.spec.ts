import { BitrixRateLimiterService } from './bitrix-rate-limiter.service';
import { RedisService } from '@/core/redis/redis.service';
import { runAsInteractive } from '../context/bitrix-call-context';
import type { BitrixRateLimitOverrides } from './bitrix-rate-limiter.config';

const makeRedis = (evalResult: number | (() => number)): RedisService => {
    const evalFn =
        typeof evalResult === 'function' ? evalResult : () => evalResult;
    return {
        getClient: () => ({
            eval: jest.fn().mockImplementation(() => Promise.resolve(evalFn())),
        }),
    } as unknown as RedisService;
};

/**
 * Переменных окружения у ограничителя нет (06.10.2026): включение и тариф —
 * настройки портала, они приходят третьим аргументом acquire.
 */
describe('BitrixRateLimiterService', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    describe('портал выключил очередь', () => {
        it('возвращается мгновенно без вызова Redis', async () => {
            const redis = makeRedis(0);
            // Клиент сужаем до формы «свойство — мок»: прямая ссылка на
            // метод класса — unbound method, правило линтера ловит
            // потенциальную потерю `this`. Сам мок при этом тот же объект,
            // счётчик вызовов сохраняется.
            const client = redis.getClient() as unknown as { eval: jest.Mock };
            const evalFn = client.eval;
            const service = new BitrixRateLimiterService(redis);

            await service.acquire('test.bitrix24.ru', undefined, {
                enabled: false,
            });

            expect(evalFn).not.toHaveBeenCalled();
        });
    });

    describe('очередь включена (по умолчанию)', () => {
        it('возвращается сразу если Redis вернул 0', async () => {
            const service = new BitrixRateLimiterService(makeRedis(0));

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

            const service = new BitrixRateLimiterService(redis);

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

            const service = new BitrixRateLimiterService(redis);

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

            const service = new BitrixRateLimiterService(redis);

            await expect(
                service.acquire('portal.bitrix24.ru'),
            ).resolves.toBeUndefined();
        });

        /** Предел ведра, с которым менеджер пришёл в Redis. */
        const interactiveLimitOf = async (
            overrides?: BitrixRateLimitOverrides,
        ): Promise<number> => {
            const evalMock = jest.fn().mockResolvedValue(0);
            const service = new BitrixRateLimiterService({
                getClient: () => ({ eval: evalMock }),
            } as unknown as RedisService);
            await runAsInteractive('test', () =>
                service.acquire('a.bitrix24.ru', undefined, overrides),
            );
            return Number((evalMock.mock.calls[0] as unknown[])[4]);
        };

        it('без настроек портала — обычный тариф, ведро 50', async () => {
            expect(await interactiveLimitOf()).toBe(50);
        });

        it('энтерпрайз из настроек портала — ведро 250', async () => {
            expect(await interactiveLimitOf({ plan: 'enterprise' })).toBe(250);
        });

        it('неизвестный тариф — обычный, ведро 50', async () => {
            expect(
                await interactiveLimitOf({
                    plan: 'unknown_plan',
                } as unknown as BitrixRateLimitOverrides),
            ).toBe(50);
        });
    });
});
