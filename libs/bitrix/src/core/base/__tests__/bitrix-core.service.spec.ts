import { TelegramService } from '@lib/telegram/telegram.service';
import {
    runAsBackground,
    runAsInteractive,
} from '../../context/bitrix-call-context';
import {
    BitrixRateLimitTimeoutError,
    BitrixRateLimiterService,
} from '../../rate-limit/bitrix-rate-limiter.service';
import type { BitrixRateLimitOverrides } from '../../rate-limit/bitrix-rate-limiter.config';
import { BitrixCore } from '../bitrix-core.service';
import { BITRIX_REQUEST_PROFILES } from '../bitrix-request-profile';
import { BxAuthType } from '../bx-auth-type.enum';

/**
 * Обращение в Битрикс: сроки по классу вызова, повторы и слоты семафора.
 *
 * До 05.10.2026 у всех был один профиль — 300 с на попытку и до 16 минут
 * на вызов, а повтор держал несколько слотов семафора сразу.
 */

const DOMAIN = 'portal.bitrix24.ru';

interface PostCall {
    url: string;
    timeout: number | undefined;
}

const timeoutError = () =>
    Object.assign(new Error('timeout of 30000ms exceeded'), {
        code: 'ECONNABORTED',
    });

const httpError = (status: number, data: unknown = {}) =>
    Object.assign(new Error(`Request failed with status code ${status}`), {
        response: { status, data },
    });

const makeCore = (
    responses: unknown[],
    rateLimit?: BitrixRateLimitOverrides,
) => {
    const acquire = jest.fn().mockResolvedValue(undefined);
    const alert = jest.fn().mockResolvedValue(undefined);
    const core = new BitrixCore(
        { sendMessageAdminError: alert } as unknown as TelegramService,
        BxAuthType.HOOK,
        DOMAIN,
        null,
        'rest/1/key',
        { acquire } as unknown as BitrixRateLimiterService,
        rateLimit,
    );
    jest.spyOn(core.logger, 'warn').mockImplementation(() => undefined);
    jest.spyOn(core.logger, 'error').mockImplementation(() => undefined);

    const calls: PostCall[] = [];
    const queue = [...responses];
    const post = jest.fn(
        (url: string, _data: unknown, config?: { timeout?: number }) => {
            calls.push({ url, timeout: config?.timeout });
            const next = queue.shift();
            return next instanceof Error
                ? Promise.reject(next)
                : Promise.resolve({ data: next });
        },
    );
    (
        core as unknown as { axiosInstance: { post: typeof post } }
    ).axiosInstance = { post };

    return { core, acquire, alert, post, calls };
};

describe('BitrixCore.request', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('успешный вызов: один запрос, слот ограничителя взят по классу вызова', async () => {
        const { core, acquire, calls } = makeCore([{ result: 1 }]);

        const response = await runAsInteractive('route', () =>
            core.request<{ result: number }>('crm.deal.get', { id: 1 }),
        );

        expect(response.data).toEqual({ result: 1 });
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe(`https://${DOMAIN}/rest/1/key/crm.deal.get`);
        expect(acquire).toHaveBeenCalledWith(
            DOMAIN,
            { callClass: 'interactive', source: 'route' },
            undefined,
        );
    });

    it('лимит портала из его настроек доходит до ограничителя', async () => {
        const { core, acquire } = makeCore([{ result: 1 }], {
            plan: 'enterprise',
            backgroundShare: 0.4,
        });

        await runAsBackground('cron', () => core.request('crm.deal.list', {}));

        expect(acquire).toHaveBeenCalledWith(
            DOMAIN,
            { callClass: 'background', source: 'cron' },
            { plan: 'enterprise', backgroundShare: 0.4 },
        );
    });

    it('менеджеру — короткий таймаут, фону — длинный', async () => {
        const interactive = makeCore([{}]);
        const background = makeCore([{}]);

        await runAsInteractive('route', () =>
            interactive.core.request('crm.deal.get', {}),
        );
        await runAsBackground('cron', () =>
            background.core.request('crm.deal.list', {}),
        );

        expect(interactive.calls[0].timeout).toBe(
            BITRIX_REQUEST_PROFILES.interactive.timeoutMs,
        );
        expect(background.calls[0].timeout).toBe(
            BITRIX_REQUEST_PROFILES.background.timeoutMs,
        );
        expect(BITRIX_REQUEST_PROFILES.interactive.timeoutMs).toBeLessThan(
            BITRIX_REQUEST_PROFILES.background.timeoutMs,
        );
    });

    it('таймаут у менеджера: один быстрый повтор, а не полминуты паузы', async () => {
        const { core, calls } = makeCore([timeoutError(), { result: 'ok' }]);

        const pending = runAsInteractive('route', () =>
            core.request<{ result: string }>('crm.deal.get', {}),
        );
        await jest.advanceTimersByTimeAsync(
            BITRIX_REQUEST_PROFILES.interactive.timeoutPauseMs,
        );

        await expect(pending).resolves.toMatchObject({
            data: { result: 'ok' },
        });
        expect(calls).toHaveLength(2);
    });

    it('таймаут у менеджера дважды — ошибка наверх после одного повтора', async () => {
        const { core, calls } = makeCore([timeoutError(), timeoutError()]);

        const pending = runAsInteractive('route', () =>
            core.request('crm.deal.get', {}),
        );
        const assertion = expect(pending).rejects.toThrow('timeout');
        await jest.advanceTimersByTimeAsync(60_000);
        await assertion;

        expect(calls).toHaveLength(2);
    });

    it('фон при таймауте повторяет дважды с длинной паузой', async () => {
        const { core, calls } = makeCore([
            timeoutError(),
            timeoutError(),
            { result: 'ok' },
        ]);

        const pending = runAsBackground('cron', () =>
            core.request('crm.deal.list', {}),
        );
        await jest.advanceTimersByTimeAsync(
            BITRIX_REQUEST_PROFILES.background.timeoutPauseMs * 2,
        );

        await expect(pending).resolves.toBeDefined();
        expect(calls).toHaveLength(3);
    });

    it('«превышен лимит запросов» в JSON-ответе — пауза и повтор, но не бесконечно', async () => {
        const limit = () => httpError(503, { error: 'QUERY_LIMIT_EXCEEDED' });
        const { core, calls } = makeCore([limit(), limit(), limit()]);

        const pending = runAsBackground('cron', () =>
            core.request('crm.deal.list', {}),
        );
        const assertion = expect(pending).rejects.toMatchObject({
            response: { status: 503 },
        });
        await jest.advanceTimersByTimeAsync(
            BITRIX_REQUEST_PROFILES.background.queryLimitPauseMs * 3,
        );
        await assertion;

        // Первая попытка и два повтора — третьего нет.
        expect(calls).toHaveLength(3);
    });

    it('обычная ошибка Битрикса не повторяется', async () => {
        const { core, calls } = makeCore([
            httpError(400, { error: 'ERROR_CORE' }),
        ]);

        await expect(
            runAsInteractive('route', () => core.request('crm.deal.get', {})),
        ).rejects.toMatchObject({ response: { status: 400 } });
        expect(calls).toHaveLength(1);
    });

    it('явное число повторов сильнее профиля класса', async () => {
        const { core, calls } = makeCore([timeoutError()]);

        await expect(
            runAsBackground('cron', () => core.request('crm.deal.list', {}, 0)),
        ).rejects.toThrow('timeout');
        expect(calls).toHaveLength(1);
    });

    it('слот семафора освобождён к моменту паузы перед повтором', async () => {
        const { core } = makeCore([timeoutError(), { result: 'ok' }]);
        const acquireSlot = jest.spyOn(core.semaphore, 'acquire');
        const releaseSlot = jest.spyOn(core.semaphore, 'release');

        const pending = runAsBackground('cron', () =>
            core.request('crm.deal.list', {}),
        );
        // Первая попытка упала, идёт пауза: слот уже возвращён.
        await jest.advanceTimersByTimeAsync(1_000);
        expect(acquireSlot).toHaveBeenCalledTimes(1);
        expect(releaseSlot).toHaveBeenCalledTimes(1);

        await jest.advanceTimersByTimeAsync(
            BITRIX_REQUEST_PROFILES.background.timeoutPauseMs,
        );
        await pending;
        expect(acquireSlot).toHaveBeenCalledTimes(2);
        expect(releaseSlot).toHaveBeenCalledTimes(2);
    });

    it('алерт об ошибке не задерживает ответ вызывающему', async () => {
        const { core, alert } = makeCore([httpError(500, 'boom')]);
        // Телеграм «висит» — раньше ошибка ждала бы его ответа.
        alert.mockReturnValue(new Promise(() => undefined));

        await expect(
            runAsInteractive('route', () => core.request('crm.deal.get', {})),
        ).rejects.toMatchObject({ response: { status: 500 } });
        expect(alert).toHaveBeenCalledTimes(1);
    });

    it('фону отказано в слоте ограничителя — запрос в Битрикс не уходит', async () => {
        const { core, acquire, post, alert } = makeCore([{ result: 1 }]);
        acquire.mockRejectedValue(
            new BitrixRateLimitTimeoutError(
                DOMAIN,
                'background',
                'cron',
                600_000,
            ),
        );

        await expect(
            runAsBackground('cron', () => core.request('crm.deal.list', {})),
        ).rejects.toBeInstanceOf(BitrixRateLimitTimeoutError);
        expect(post).not.toHaveBeenCalled();
        // Это не ошибка Битрикса — алерта о сбое вызова нет.
        expect(alert).not.toHaveBeenCalled();
    });
});

describe('BitrixCore: пауза после тяжёлого фонового запроса', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    /** Ответ Битрикса, над которым он работал processing секунд. */
    const heavy = (processing: number) => ({ result: 1, time: { processing } });

    it('фон: Битрикс работал 3 с — следующий шаг фона ждёт столько же', async () => {
        const { core } = makeCore([heavy(3)]);
        let done = false;

        const pending = runAsBackground('cron', () =>
            core.request('crm.deal.list', {}),
        ).then(() => {
            done = true;
        });
        await jest.advanceTimersByTimeAsync(2_900);
        expect(done).toBe(false);
        await jest.advanceTimersByTimeAsync(200);
        await pending;

        expect(done).toBe(true);
    });

    it('пауза не длиннее 10 с, даже если Битрикс работал минуту', async () => {
        const { core } = makeCore([heavy(60)]);
        let done = false;

        const pending = runAsBackground('cron', () =>
            core.request('crm.deal.list', {}),
        ).then(() => {
            done = true;
        });
        await jest.advanceTimersByTimeAsync(10_100);
        await pending;

        expect(done).toBe(true);
    });

    it('менеджер и лёгкий фон паузы не ждут', async () => {
        const interactive = makeCore([heavy(3)]);
        const light = makeCore([heavy(1)]);
        let interactiveDone = false;
        let lightDone = false;

        void runAsInteractive('route', () =>
            interactive.core.request('crm.deal.get', {}),
        ).then(() => {
            interactiveDone = true;
        });
        void runAsBackground('cron', () =>
            light.core.request('crm.deal.list', {}),
        ).then(() => {
            lightDone = true;
        });
        await jest.advanceTimersByTimeAsync(10);

        expect(interactiveDone).toBe(true);
        expect(lightDone).toBe(true);
    });
});
