import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { EgressProxyService } from '@lib/egress-proxy';
import { telegramWebhookSecret } from '@lib/telegram';
import { VendorSettingsReader } from '@lib/vendor-settings';
import {
    CABINET_TELEGRAM_WEBHOOK_PURPOSE,
    ClientTelegramBotClient,
} from '../client-telegram-bot.client';

const clientTelegramWebhookSecret = (token: string): string =>
    telegramWebhookSecret(token, CABINET_TELEGRAM_WEBHOOK_PURPOSE);

describe('ClientTelegramBotClient', () => {
    let token: string | null;
    let post: jest.Mock;
    let bot: ClientTelegramBotClient;

    const getMeOk = (username: string) =>
        of({ data: { ok: true, result: { username } } });

    beforeEach(() => {
        token = '111:AAA';
        post = jest.fn();
        const reader: VendorSettingsReader = {
            get: () => Promise.resolve(token),
            getMany: () => Promise.resolve({}),
        };
        bot = new ClientTelegramBotClient(
            { post } as unknown as HttpService,
            {
                route: (url: string) => ({ url, headers: {}, viaProxy: false }),
                resolveRoute: (url: string) =>
                    Promise.resolve({ url, headers: {}, viaProxy: false }),
            } as unknown as EgressProxyService,
            {} as ConfigService,
            reader,
        );
    });

    afterEach(() => jest.useRealTimers());

    it('секрет вебхука вычисляется из токена: hex, допустимый для Telegram', async () => {
        const secret = await bot.webhookSecret();
        expect(secret).toBe(clientTelegramWebhookSecret('111:AAA'));
        expect(secret).toMatch(/^[a-f0-9]{64}$/);
        expect(clientTelegramWebhookSecret('222:BBB')).not.toBe(secret);
        token = null;
        expect(await bot.webhookSecret()).toBeNull();
    });

    it('имя бота: getMe один раз на токен, новый токен — новый запрос', async () => {
        post.mockReturnValueOnce(getMeOk('april_clients_bot'));
        expect(await bot.botUsername()).toBe('april_clients_bot');
        expect(await bot.botUsername()).toBe('april_clients_bot');
        expect(post).toHaveBeenCalledTimes(1);
        expect(post).toHaveBeenCalledWith(
            'https://api.telegram.org/bot111:AAA/getMe',
            {},
            expect.any(Object),
        );

        token = '222:BBB';
        post.mockReturnValueOnce(getMeOk('april_new_bot'));
        expect(await bot.botUsername()).toBe('april_new_bot');
        expect(post).toHaveBeenCalledTimes(2);
    });

    it('Telegram не ответил — null, повтор не раньше чем через минуту', async () => {
        jest.useFakeTimers({ now: new Date('2026-11-08T10:00:00Z') });
        post.mockReturnValueOnce(throwError(() => new Error('timeout')));
        expect(await bot.botUsername()).toBeNull();
        expect(await bot.botUsername()).toBeNull();
        expect(post).toHaveBeenCalledTimes(1);

        jest.setSystemTime(new Date('2026-11-08T10:01:01Z'));
        post.mockReturnValueOnce(getMeOk('april_clients_bot'));
        expect(await bot.botUsername()).toBe('april_clients_bot');
        expect(post).toHaveBeenCalledTimes(2);
    });

    it('нет токена — имени нет, в Telegram не ходим', async () => {
        token = null;
        expect(await bot.botUsername()).toBeNull();
        expect(post).not.toHaveBeenCalled();
    });
});
