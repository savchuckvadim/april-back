import { Logger } from '@nestjs/common';
import { LlmCircuitBreakerService } from '../llm-circuit-breaker.service';

const T0 = 1_700_000_000_000;
const VALUES: Record<string, string> = {
    LLM_CIRCUIT_FAILURES: '3',
    LLM_CIRCUIT_WINDOW_SEC: '60',
    LLM_CIRCUIT_COOLDOWN_SEC: '120',
};
const config = { get: (key: string) => VALUES[key] };

/** Redis не поднят — состояние в памяти процесса. */
const noRedis = {
    getClient: () => {
        throw new Error('Redis недоступен');
    },
};

const makeRedis = () => ({
    exists: jest.fn().mockResolvedValue(0),
    incr: jest.fn(),
    expire: jest.fn().mockResolvedValue(1),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
});

describe('LlmCircuitBreakerService — предохранитель провайдера', () => {
    let error: jest.SpyInstance;
    let warn: jest.SpyInstance;

    beforeEach(() => {
        error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    it('без Redis: три временных сбоя в окне — пауза с телеграмом, после паузы — снова включён', async () => {
        const breaker = new LlmCircuitBreakerService(
            config as never,
            noRedis as never,
        );

        await breaker.recordFailure('vibecode', 'HTTP 502', T0);
        await breaker.recordFailure('vibecode', 'HTTP 502', T0 + 1000);
        expect(await breaker.isOpen('vibecode', T0 + 2000)).toBe(false);

        await breaker.recordFailure('vibecode', 'HTTP 503', T0 + 2000);
        expect(await breaker.isOpen('vibecode', T0 + 3000)).toBe(true);
        expect(error).toHaveBeenCalledWith(
            expect.stringContaining('vibecode отключён на 2 мин'),
            { telegram: true },
        );
        // Запасного провайдера пауза основного не касается.
        expect(await breaker.isOpen('openai-compatible', T0 + 3000)).toBe(
            false,
        );
        // Пауза 120 с отсчитывается от третьего сбоя (T0 + 2 с): в T0 + 121 с
        // ещё идёт, в T0 + 122 с истекла.
        expect(await breaker.isOpen('vibecode', T0 + 121_000)).toBe(true);
        expect(await breaker.isOpen('vibecode', T0 + 122_001)).toBe(false);
    });

    it('без Redis: сбои за пределами окна не считаются', async () => {
        const breaker = new LlmCircuitBreakerService(
            config as never,
            noRedis as never,
        );
        await breaker.recordFailure('vibecode', 'x', T0);
        await breaker.recordFailure('vibecode', 'x', T0 + 30_000);
        // Первый сбой старше 60 с — в окне только два.
        await breaker.recordFailure('vibecode', 'x', T0 + 70_000);
        expect(await breaker.isOpen('vibecode', T0 + 71_000)).toBe(false);
    });

    it('удачный ответ обнуляет серию; снятие паузы — предупреждение в телеграм', async () => {
        const breaker = new LlmCircuitBreakerService(
            config as never,
            noRedis as never,
        );
        await breaker.recordFailure('vibecode', 'x', T0);
        await breaker.recordFailure('vibecode', 'x', T0);
        await breaker.recordSuccess('vibecode', T0);
        await breaker.recordFailure('vibecode', 'x', T0 + 1);
        expect(await breaker.isOpen('vibecode', T0 + 2)).toBe(false);
        expect(warn).not.toHaveBeenCalled();

        await breaker.recordFailure('vibecode', 'x', T0 + 2);
        await breaker.recordFailure('vibecode', 'x', T0 + 3);
        expect(await breaker.isOpen('vibecode', T0 + 4)).toBe(true);
        await breaker.recordSuccess('vibecode', T0 + 5);
        expect(await breaker.isOpen('vibecode', T0 + 6)).toBe(false);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('vibecode снова отвечает'),
            { telegram: true },
        );
    });

    it('с Redis: счётчик с TTL окна, пауза через SET NX — алерт только у той реплики, что поставила паузу', async () => {
        const redis = makeRedis();
        redis.incr
            .mockResolvedValueOnce(1)
            .mockResolvedValueOnce(2)
            .mockResolvedValueOnce(3);
        const breaker = new LlmCircuitBreakerService(
            config as never,
            { getClient: () => redis } as never,
        );

        await breaker.recordFailure('vibecode', 'x', T0);
        expect(redis.expire).toHaveBeenCalledWith(
            'llm-gateway:circuit:vibecode:failures',
            60,
        );
        await breaker.recordFailure('vibecode', 'x', T0);
        await breaker.recordFailure('vibecode', 'x', T0);
        expect(redis.set).toHaveBeenCalledWith(
            'llm-gateway:circuit:vibecode:open',
            String(T0),
            'EX',
            120,
            'NX',
        );
        expect(error).toHaveBeenCalledTimes(1);

        // Другая реплика: ключ паузы уже есть — SET NX вернул null, алерта нет.
        redis.incr.mockResolvedValueOnce(3);
        redis.set.mockResolvedValueOnce(null);
        await breaker.recordFailure('vibecode', 'x', T0);
        expect(error).toHaveBeenCalledTimes(1);

        redis.exists.mockResolvedValueOnce(1);
        expect(await breaker.isOpen('vibecode')).toBe(true);
    });

    it('ошибка Redis не роняет вызов: провайдер считается включённым, счёт идёт в памяти', async () => {
        const redis = makeRedis();
        redis.exists.mockRejectedValue(new Error('READONLY'));
        redis.incr.mockRejectedValue(new Error('READONLY'));
        const breaker = new LlmCircuitBreakerService(
            config as never,
            { getClient: () => redis } as never,
        );
        expect(await breaker.isOpen('vibecode', T0)).toBe(false);
        await breaker.recordFailure('vibecode', 'x', T0);
        await breaker.recordFailure('vibecode', 'x', T0);
        expect(await breaker.isOpen('vibecode', T0)).toBe(false);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('не прочитано из Redis'),
        );
    });
});
