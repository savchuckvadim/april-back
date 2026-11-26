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
import { bitrixCallMethodOf } from '../bitrix-error-method.util';
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

    /*
     * gsirk 26.11.2026, сделка 281275: disk.folder.uploadfile → HTTP 400
     * DISK_FOLDER_22002 («Не удалось сохранить файл»). Без повтора падала
     * вся генерация КП; через 8 минут тот же запрос проходил.
     */
    describe('отказ Диска DISK_FOLDER_22002', () => {
        const diskBusy = () =>
            httpError(400, {
                error: 'DISK_FOLDER_22002',
                error_description:
                    'Не удалось сохранить файл. (DISK_FOLDER_22002).',
            });
        const upload = (core: BitrixCore) =>
            core.request('disk.folder.uploadfile', {
                id: 12,
                fileContent: ['КП.docx', 'YWJj'],
            });

        it('фон: первая загрузка отказана, повтор проходит', async () => {
            const { core, calls, alert } = makeCore([
                diskBusy(),
                { result: { ID: 77 } },
            ]);

            const pending = runAsBackground('queue', () => upload(core));
            await jest.advanceTimersByTimeAsync(
                BITRIX_REQUEST_PROFILES.background.busyPauseMs,
            );

            await expect(pending).resolves.toMatchObject({
                data: { result: { ID: 77 } },
            });
            expect(calls).toHaveLength(2);
            expect(alert).toHaveBeenNthCalledWith(
                1,
                expect.stringMatching(/^Попытка 1 из 3, повтор через 10 с\. /),
            );
        });

        it('менеджер: один повтор, и ошибка наверх с кодом Диска', async () => {
            const { core, calls } = makeCore([diskBusy(), diskBusy()]);

            const pending = runAsInteractive('route', () => upload(core));
            const assertion = expect(pending).rejects.toMatchObject({
                response: { status: 400 },
            });
            await jest.advanceTimersByTimeAsync(
                BITRIX_REQUEST_PROFILES.interactive.busyPauseMs,
            );
            await assertion;

            expect(calls).toHaveLength(2);
        });

        it('остальной 400 Диска не повторяется: одна попытка', async () => {
            const { core, calls } = makeCore([
                httpError(400, {
                    error: 'DISK_FOLDER_22003',
                    error_description: 'Папка не найдена',
                }),
            ]);

            await expect(
                runAsBackground('queue', () => upload(core)),
            ).rejects.toMatchObject({ response: { status: 400 } });
            expect(calls).toHaveLength(1);
        });
    });

    describe('ошибка вызова несёт метод Битрикса', () => {
        it('брошенная наверх ошибка помечена методом вызова', async () => {
            const { core } = makeCore([
                httpError(403, { error: 'ACCESS_DENIED' }),
            ]);

            const failure = await runAsInteractive('route', () =>
                core.request('crm.deal.get', { id: 1 }),
            ).catch((error: unknown) => error);

            expect(bitrixCallMethodOf(failure)).toBe('crm.deal.get');
        });
    });

    /*
     * В строке «Error calling Bitrix» запрос раньше печатался первой тысячей
     * символов: при загрузке на Диск там оказывалось начало base64 документа.
     */
    describe('лог ошибки без содержимого файла', () => {
        it('disk.folder.uploadfile: в логе имя файла и «<N байт>», base64 нет', async () => {
            const base64 = Buffer.alloc(30_000, 'doc').toString('base64');
            const { core } = makeCore([
                httpError(400, {
                    error: 'DISK_FOLDER_22003',
                    error_description: 'Папка не найдена',
                }),
            ]);

            await expect(
                runAsInteractive('route', () =>
                    core.request('disk.folder.uploadfile', {
                        id: 12,
                        data: { NAME: 'КП.docx' },
                        fileContent: ['КП.docx', base64],
                    }),
                ),
            ).rejects.toBeDefined();

            const lines = (core.logger.error as jest.Mock).mock.calls.map(
                ([line]: [string]) => line,
            );
            const line = lines.find(text =>
                text.includes('Error calling Bitrix [disk.folder.uploadfile]'),
            );
            expect(line).toBeDefined();
            expect(line).toContain(`"fileContent":["КП.docx","<30000 байт>"]`);
            expect(line).toContain('"id":12');
            expect(line).not.toContain(base64.slice(0, 40));
        });
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

    /*
     * garantservisvoronezh 09.11.2026 10:00:05: один 500 «INTERNAL_SERVER_ERROR»
     * на crm.item.list уронил окно холодного обзвона на 85 сделок. Облако
     * отдаёт 500 всплесками по 1–2 минуты, повтор через секунды проходит.
     */
    it('500 портала у менеджера — один повтор, вторая попытка проходит', async () => {
        const { core, calls } = makeCore([httpError(500), { result: 1 }]);

        const pending = runAsInteractive('route', () =>
            core.request<{ result: number }>('crm.item.list', {}),
        );
        await jest.advanceTimersByTimeAsync(
            BITRIX_REQUEST_PROFILES.interactive.busyPauseMs,
        );
        const response = await pending;

        expect(response.data).toEqual({ result: 1 });
        expect(calls).toHaveLength(2);
    });

    // gsr 02.11.2026: сервер закрыл простаивавший сокет пула — «socket hang up».
    it('обрыв соединения у менеджера — один быстрый повтор, вторая попытка проходит', async () => {
        const reset = Object.assign(new Error('socket hang up'), {
            code: 'ECONNRESET',
        });
        const { core, calls } = makeCore([reset, { result: 1 }]);

        const pending = runAsInteractive('route', () =>
            core.request<{ result: number }>('crm.deal.get', {}),
        );
        await jest.advanceTimersByTimeAsync(
            BITRIX_REQUEST_PROFILES.interactive.connectionResetPauseMs,
        );
        const response = await pending;

        expect(response.data).toEqual({ result: 1 });
        expect(calls).toHaveLength(2);
    });

    it('500 дважды у менеджера — ошибка наверх после одного повтора', async () => {
        const { core, calls } = makeCore([httpError(500), httpError(500)]);

        const pending = runAsInteractive('route', () =>
            core.request('crm.item.list', {}),
        );
        const assertion = expect(pending).rejects.toMatchObject({
            response: { status: 500 },
        });
        await jest.advanceTimersByTimeAsync(
            BITRIX_REQUEST_PROFILES.interactive.busyPauseMs,
        );
        await assertion;

        expect(calls).toHaveLength(2);
    });

    // Решение владельца 10.11.2026: тревога на каждую попытку, но с пометкой.
    it('500 с успешным повтором — тревога с пометкой «попытка 1 из 2, повтор»', async () => {
        const { core, alert } = makeCore([httpError(500), { result: 1 }]);

        const pending = runAsInteractive('route', () =>
            core.request('crm.item.list', {}),
        );
        await jest.advanceTimersByTimeAsync(
            BITRIX_REQUEST_PROFILES.interactive.busyPauseMs,
        );
        await pending;

        expect(alert).toHaveBeenCalledTimes(1);
        expect(alert).toHaveBeenNthCalledWith(
            1,
            expect.stringMatching(
                /^Попытка 1 из 2, повтор через \d+(\.\d+)? с\. Bitrix API error \(crm\.item\.list\)/,
            ),
        );
    });

    it('500 на всех попытках — последняя тревога «попытки исчерпаны»', async () => {
        const { core, alert } = makeCore([httpError(500), httpError(500)]);

        const pending = runAsInteractive('route', () =>
            core.request('crm.item.list', {}),
        );
        const assertion = expect(pending).rejects.toMatchObject({
            response: { status: 500 },
        });
        await jest.advanceTimersByTimeAsync(
            BITRIX_REQUEST_PROFILES.interactive.busyPauseMs,
        );
        await assertion;

        expect(alert).toHaveBeenCalledTimes(2);
        expect(alert).toHaveBeenNthCalledWith(
            1,
            expect.stringMatching(/^Попытка 1 из 2/),
        );
        expect(alert).toHaveBeenNthCalledWith(
            2,
            expect.stringMatching(
                /^⚠️ ПОПЫТКИ ИСЧЕРПАНЫ \(2 из 2\) — запрос не выполнен\. Bitrix API error/,
            ),
        );
    });

    it('400 не повторяется — тревога без пометки', async () => {
        const { core, alert } = makeCore([httpError(400, 'boom')]);

        await expect(
            runAsInteractive('route', () => core.request('crm.deal.get', {})),
        ).rejects.toMatchObject({ response: { status: 400 } });
        expect(alert).toHaveBeenNthCalledWith(
            1,
            expect.stringMatching(/^Bitrix API error \(crm\.deal\.get\)/),
        );
    });

    it('алерт об ошибке не задерживает ответ вызывающему', async () => {
        const { core, alert } = makeCore([httpError(400, 'boom')]);
        // Телеграм «висит» — раньше ошибка ждала бы его ответа.
        alert.mockReturnValue(new Promise(() => undefined));

        await expect(
            runAsInteractive('route', () => core.request('crm.deal.get', {})),
        ).rejects.toMatchObject({ response: { status: 400 } });
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
