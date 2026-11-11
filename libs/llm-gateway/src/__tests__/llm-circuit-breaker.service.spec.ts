import { Logger } from '@nestjs/common';
import { LlmCircuitBreakerService } from '../llm-circuit-breaker.service';
import { LlmGatewaySettingsService } from '../llm-gateway-settings.service';

const T0 = 1_700_000_000_000;
const VALUES: Record<string, string> = {
    LLM_CIRCUIT_FAILURES: '3',
    LLM_CIRCUIT_WINDOW_SEC: '60',
    LLM_CIRCUIT_COOLDOWN_SEC: '120',
};
const config = { get: (key: string) => VALUES[key] };
/** Пороги без админки — как из env (настоящий читатель настроек шлюза). */
const settings = new LlmGatewaySettingsService(config as never);

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
            settings,
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
            settings,
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
            settings,
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
        const breaker = new LlmCircuitBreakerService(settings, {
            getClient: () => redis,
        } as never);

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
        const breaker = new LlmCircuitBreakerService(settings, {
            getClient: () => redis,
        } as never);
        expect(await breaker.isOpen('vibecode', T0)).toBe(false);
        await breaker.recordFailure('vibecode', 'x', T0);
        await breaker.recordFailure('vibecode', 'x', T0);
        expect(await breaker.isOpen('vibecode', T0)).toBe(false);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('не прочитано из Redis'),
        );
    });

    /**
     * Пороги — из админки (11.11.2026): читаются на каждом сбое, правка
     * действует без перезапуска.
     */
    it('пороги перечитываются на каждом сбое: правка в админке действует сразу', async () => {
        const values: Record<string, string> = { LLM_CIRCUIT_FAILURES: '3' };
        const reader = {
            get: (key: string) => Promise.resolve(values[key] ?? null),
            getMany: (keys: readonly string[]) =>
                Promise.resolve(
                    Object.fromEntries(
                        keys.map(key => [key, values[key] ?? null]),
                    ),
                ),
        };
        const breaker = new LlmCircuitBreakerService(
            new LlmGatewaySettingsService(config as never, reader),
            noRedis as never,
        );
        await breaker.recordFailure('vibecode', 'x', T0);
        // Админ опустил порог до двух — второй сбой уже ставит паузу.
        values.LLM_CIRCUIT_FAILURES = '2';
        await breaker.recordFailure('vibecode', 'x', T0 + 1);
        expect(await breaker.isOpen('vibecode', T0 + 2)).toBe(true);
    });
});

/**
 * Проба поставщика на паузе — одна за раз на все реплики (11.11.2026): без
 * замка каждый разбор, у которого не ответил и запасной, сам шёл пробой к
 * зависшему поставщику и ждал таймаут.
 */
describe('LlmCircuitBreakerService — замок пробного вызова', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });
    afterEach(() => jest.restoreAllMocks());

    it('без Redis: проба одна — вторая не пускается, после endProbe снова можно', async () => {
        const breaker = new LlmCircuitBreakerService(
            settings,
            noRedis as never,
        );
        expect(await breaker.tryStartProbe('vibecode', 'p1')).toBe(true);
        expect(await breaker.tryStartProbe('vibecode', 'p2')).toBe(false);
        // У другого поставщика свой замок.
        expect(await breaker.tryStartProbe('openai-compatible', 'p3')).toBe(
            true,
        );

        await breaker.endProbe('vibecode', 'p1');
        expect(await breaker.tryStartProbe('vibecode', 'p4')).toBe(true);
    });

    /**
     * Ревью 11.11.2026: снятие без маркера сбрасывало чужой замок — проба,
     * чей замок истёк, по окончании снимала замок следующей пробы.
     */
    it('чужой маркер замок не снимает', async () => {
        const breaker = new LlmCircuitBreakerService(
            settings,
            noRedis as never,
        );
        expect(await breaker.tryStartProbe('vibecode', 'mine')).toBe(true);
        await breaker.endProbe('vibecode', 'stale');
        expect(await breaker.tryStartProbe('vibecode', 'other')).toBe(false);
        await breaker.endProbe('vibecode', 'mine');
        expect(await breaker.tryStartProbe('vibecode', 'other')).toBe(true);
    });

    it('с Redis: замок — SET NX с маркером и сроком «самый долгий ответ + минута», снятие — только своего', async () => {
        const redis = { ...makeRedis(), eval: jest.fn().mockResolvedValue(1) };
        const breaker = new LlmCircuitBreakerService(settings, {
            getClient: () => redis,
        } as never);
        expect(await breaker.tryStartProbe('vibecode', 'token-1')).toBe(true);
        // По умолчанию срок ответа 180 000 мс → 180 + 60 с.
        expect(redis.set).toHaveBeenCalledWith(
            'llm-gateway:circuit:vibecode:probe',
            'token-1',
            'EX',
            240,
            'NX',
        );

        // Пробу уже ведёт другая реплика — SET NX вернул null.
        redis.set.mockResolvedValueOnce(null);
        expect(await breaker.tryStartProbe('vibecode', 'token-2')).toBe(false);

        await breaker.endProbe('vibecode', 'token-1');
        expect(redis.eval).toHaveBeenCalledWith(
            expect.stringContaining("redis.call('get', KEYS[1]) == ARGV[1]"),
            1,
            'llm-gateway:circuit:vibecode:probe',
            'token-1',
        );
        expect(redis.del).not.toHaveBeenCalled();
    });

    it('срок ответа подняли до 300 000 — замок живёт 360 с', async () => {
        const redis = { ...makeRedis(), eval: jest.fn().mockResolvedValue(1) };
        const breaker = new LlmCircuitBreakerService(
            new LlmGatewaySettingsService({
                get: (key: string) =>
                    key === 'VIBECODE_ANALYSIS_TIMEOUT_MS'
                        ? '300000'
                        : undefined,
            } as never),
            { getClient: () => redis } as never,
        );
        await breaker.tryStartProbe('vibecode', 't');
        expect(redis.set).toHaveBeenCalledWith(
            expect.any(String),
            't',
            'EX',
            360,
            'NX',
        );
    });

    it('ошибка Redis — замок в памяти процесса, вызов не падает', async () => {
        const redis = {
            ...makeRedis(),
            eval: jest.fn().mockRejectedValue(new Error('READONLY')),
        };
        redis.set.mockRejectedValue(new Error('READONLY'));
        const breaker = new LlmCircuitBreakerService(settings, {
            getClient: () => redis,
        } as never);
        expect(await breaker.tryStartProbe('vibecode', 'a')).toBe(true);
        expect(await breaker.tryStartProbe('vibecode', 'b')).toBe(false);
        await expect(
            breaker.endProbe('vibecode', 'a'),
        ).resolves.toBeUndefined();
        expect(await breaker.tryStartProbe('vibecode', 'c')).toBe(true);
    });
});

/**
 * Тревога «отказали все», пока основной на паузе, — одна за паузу (ревью
 * 11.11.2026): иначе каждый отложенный вызов слал «ПОПЫТКИ ИСЧЕРПАНЫ», и
 * Telegram глушил сообщение «снова отвечает».
 */
describe('LlmCircuitBreakerService — одна тревога за паузу', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });
    afterEach(() => jest.restoreAllMocks());

    it('без Redis: первая заявка получает право, остальные — нет до конца паузы', async () => {
        const now = jest.spyOn(Date, 'now').mockReturnValue(T0);
        const breaker = new LlmCircuitBreakerService(
            settings,
            noRedis as never,
        );
        expect(await breaker.claimPausedAlert('vibecode')).toBe(true);
        expect(await breaker.claimPausedAlert('vibecode')).toBe(false);
        expect(await breaker.claimPausedAlert('openai-compatible')).toBe(true);
        // Пауза в конфиге — 120 с; после неё право снова есть.
        now.mockReturnValue(T0 + 121_000);
        expect(await breaker.claimPausedAlert('vibecode')).toBe(true);
    });

    it('с Redis: SET NX на срок паузы — право у одной реплики', async () => {
        const redis = makeRedis();
        const breaker = new LlmCircuitBreakerService(settings, {
            getClient: () => redis,
        } as never);
        expect(await breaker.claimPausedAlert('vibecode')).toBe(true);
        expect(redis.set).toHaveBeenCalledWith(
            'llm-gateway:circuit:vibecode:paused-alert',
            expect.any(String),
            'EX',
            120,
            'NX',
        );
        redis.set.mockResolvedValueOnce(null);
        expect(await breaker.claimPausedAlert('vibecode')).toBe(false);
    });
});

/**
 * Разметка тревог (политика владельца 10.11.2026): пауза при живом
 * запасном — «повтор, работа идёт», пауза последнего — «попытки
 * исчерпаны».
 */
describe('LlmCircuitBreakerService — пометки тревоги', () => {
    let error: jest.SpyInstance;

    beforeEach(() => {
        error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });
    afterEach(() => jest.restoreAllMocks());

    const makeBreaker = () =>
        new LlmCircuitBreakerService(settings, noRedis as never);

    it('запасной есть — «Повтор», работа идёт через запасного', async () => {
        const breaker = makeBreaker();
        await breaker.recordFailure('vibecode', 'x', T0, true);
        await breaker.recordFailure('vibecode', 'x', T0, true);
        await breaker.recordFailure('vibecode', 'HTTP 502', T0, true);
        expect(error).toHaveBeenCalledTimes(1);
        const [message] = error.mock.calls[0] as [string];
        expect(message).toContain('Повтор: провайдер LLM vibecode отключён');
        expect(message).toContain('работа идёт через запасного');
    });

    it('запасных нет — «ПОПЫТКИ ИСЧЕРПАНЫ» и предупреждение про остановку', async () => {
        const breaker = makeBreaker();
        await breaker.recordFailure('ai-rag', 'x', T0, false);
        await breaker.recordFailure('ai-rag', 'x', T0, false);
        await breaker.recordFailure('ai-rag', 'HTTP 500', T0, false);
        const [message] = error.mock.calls[0] as [string];
        expect(message).toContain('ПОПЫТКИ ИСЧЕРПАНЫ');
        expect(message).toContain('запасных нет');
        expect(message).toContain('разборы и отчёты встанут');
    });
});
