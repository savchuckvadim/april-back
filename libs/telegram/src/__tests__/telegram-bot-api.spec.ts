import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { AxiosError, AxiosHeaders } from 'axios';
import { of, throwError } from 'rxjs';
import { APP_ROLE_ENV } from '@lib/core/bootstrap/app-role';
import { EgressProxyService } from '@lib/egress-proxy';
import {
    callTelegramBotApi,
    fetchTelegramBotUsername,
    TELEGRAM_WEBHOOK_RESYNC_MS,
    TelegramBotApiTransport,
    TelegramWebhookRegistrarBase,
    telegramSecretsEqual,
    telegramWebhookSecret,
} from '../bot-api';

const TOKEN = '123456:SECRET-TOKEN';

function transportWith(post: jest.Mock): TelegramBotApiTransport {
    return {
        http: { post } as unknown as HttpService,
        egress: {
            route: (url: string) => ({ url, headers: {}, viaProxy: false }),
        } as unknown as EgressProxyService,
    };
}

function axiosError(status: number, description: string): AxiosError {
    const error = new AxiosError(`Request failed with status code ${status}`);
    error.response = {
        status,
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { ok: false, description },
    };
    return error;
}

describe('callTelegramBotApi', () => {
    it('ok — отдаёт result; адрес с токеном, таймаут', async () => {
        const post = jest
            .fn()
            .mockReturnValue(of({ data: { ok: true, result: { id: 1 } } }));
        await expect(
            callTelegramBotApi(transportWith(post), TOKEN, 'getMe', {}),
        ).resolves.toEqual({ id: 1 });
        expect(post).toHaveBeenCalledWith(
            `https://api.telegram.org/bot${TOKEN}/getMe`,
            {},
            { timeout: 15_000 },
        );
    });

    it('HTTP-ошибка — текст Telegram, без токена в сообщении', async () => {
        const post = jest
            .fn()
            .mockReturnValue(throwError(() => axiosError(401, 'Unauthorized')));
        const call = callTelegramBotApi(
            transportWith(post),
            TOKEN,
            'getMe',
            {},
        );
        await expect(call).rejects.toThrow('getMe: Unauthorized');
        await expect(call).rejects.not.toThrow(TOKEN);
    });

    it('ok=false — ошибка с описанием', async () => {
        const post = jest
            .fn()
            .mockReturnValue(
                of({ data: { ok: false, description: 'chat not found' } }),
            );
        await expect(
            callTelegramBotApi(transportWith(post), TOKEN, 'sendMessage', {}),
        ).rejects.toThrow('sendMessage: chat not found');
    });

    it('fetchTelegramBotUsername — имя бота без @', async () => {
        const post = jest.fn().mockReturnValue(
            of({
                data: { ok: true, result: { username: 'AprilReportBot' } },
            }),
        );
        await expect(
            fetchTelegramBotUsername(transportWith(post), TOKEN),
        ).resolves.toBe('AprilReportBot');
    });
});

describe('секрет вебхука', () => {
    it('из токена: hex 64, свой у каждого бота, меняется с токеном', () => {
        const support = telegramWebhookSecret(TOKEN, 'support');
        expect(support).toMatch(/^[a-f0-9]{64}$/);
        expect(telegramWebhookSecret(TOKEN, 'support')).toBe(support);
        expect(telegramWebhookSecret(TOKEN, 'cabinet')).not.toBe(support);
        expect(telegramWebhookSecret('999:OTHER', 'support')).not.toBe(support);
    });

    it('сравнение не зависит от длины', () => {
        expect(telegramSecretsEqual('abc', 'abc')).toBe(true);
        expect(telegramSecretsEqual('abc', 'abcd')).toBe(false);
        expect(telegramSecretsEqual('', 'a')).toBe(false);
    });
});

class TestRegistrar extends TelegramWebhookRegistrarBase {
    protected readonly logger = new Logger('TestRegistrar');
    protected readonly botName = 'Тестовый бот';
    protected readonly urlEnvName = 'TEST_WEBHOOK_URL';
    protected readonly noUrlEffect = 'ничего не работает';
    secret: string | null = 'sec-1';
    readonly setWebhookMock = jest.fn().mockResolvedValue(undefined);

    protected webhookUrl(): string {
        return 'https://example.test/webhook';
    }
    protected webhookSecret(): Promise<string | null> {
        return Promise.resolve(this.secret);
    }
    protected setWebhook(url: string, secret: string): Promise<void> {
        return this.setWebhookMock(url, secret) as Promise<void>;
    }
}

describe('TelegramWebhookRegistrarBase', () => {
    const savedRole = process.env[APP_ROLE_ENV];
    let registrar: TestRegistrar;

    beforeEach(() => {
        jest.useFakeTimers();
        delete process.env[APP_ROLE_ENV];
        registrar = new TestRegistrar();
    });

    afterEach(() => {
        registrar.onApplicationShutdown();
        jest.useRealTimers();
        if (savedRole === undefined) delete process.env[APP_ROLE_ENV];
        else process.env[APP_ROLE_ENV] = savedRole;
    });

    it('старт — регистрирует; смена токена — перерегистрирует на следующей сверке', async () => {
        registrar.onApplicationBootstrap();
        await jest.advanceTimersByTimeAsync(0);
        expect(registrar.setWebhookMock).toHaveBeenCalledWith(
            'https://example.test/webhook',
            'sec-1',
        );

        await jest.advanceTimersByTimeAsync(TELEGRAM_WEBHOOK_RESYNC_MS);
        expect(registrar.setWebhookMock).toHaveBeenCalledTimes(1);

        registrar.secret = 'sec-2';
        await jest.advanceTimersByTimeAsync(TELEGRAM_WEBHOOK_RESYNC_MS);
        expect(registrar.setWebhookMock).toHaveBeenCalledTimes(2);
        expect(registrar.setWebhookMock).toHaveBeenLastCalledWith(
            'https://example.test/webhook',
            'sec-2',
        );
    });

    it('зеркало — ни регистрации, ни таймера', async () => {
        process.env[APP_ROLE_ENV] = 'standby';
        registrar.onApplicationBootstrap();
        await jest.advanceTimersByTimeAsync(TELEGRAM_WEBHOOK_RESYNC_MS * 3);
        expect(registrar.setWebhookMock).not.toHaveBeenCalled();
    });
});
