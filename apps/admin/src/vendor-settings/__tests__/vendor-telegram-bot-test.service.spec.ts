import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { EgressProxyService } from '@lib/egress-proxy';
import { VendorSettingsReader } from '@lib/vendor-settings';
import { TelegramBotsCatalog } from '../services/telegram-bots.catalog';
import { VendorTelegramBotTestService } from '../services/vendor-telegram-bot-test.service';

function setup(
    admin: Record<string, string>,
    env: Record<string, string>,
    fail?: string,
) {
    const post = jest.fn(() =>
        fail
            ? throwError(() => new Error(fail))
            : of({ data: { ok: true, result: { message_id: 1 } } }),
    );
    const reader: VendorSettingsReader = {
        get: key => Promise.resolve(admin[key] ?? null),
        getMany: () => Promise.resolve({}),
    };
    const service = new VendorTelegramBotTestService(
        { post } as unknown as HttpService,
        {
            route: (url: string) => ({ url, headers: {}, viaProxy: false }),
            resolveRoute: (url: string) =>
                Promise.resolve({ url, headers: {}, viaProxy: false }),
        } as unknown as EgressProxyService,
        new TelegramBotsCatalog(
            { get: (key: string) => env[key] } as unknown as ConfigService,
            reader,
        ),
    );
    return { service, post };
}

describe('VendorTelegramBotTestService', () => {
    it('поддержка — в чат поддержки из настроек', async () => {
        const { service, post } = setup(
            {
                SUPPORT_TELEGRAM_BOT_TOKEN: '222:s',
                SUPPORT_TELEGRAM_CHAT_ID: '-100500',
            },
            {},
        );
        const result = await service.send('SUPPORT_TELEGRAM_BOT_TOKEN');
        expect(result).toEqual({
            ok: true,
            message: 'Сообщение доставлено в чат -100500.',
        });
        expect(post).toHaveBeenCalledWith(
            'https://api.telegram.org/bot222:s/sendMessage',
            expect.objectContaining({ chat_id: '-100500' }),
            expect.any(Object),
        );
    });

    it('тревоги — в TELEGRAM_ADMIN_CHAT_ID окружения', async () => {
        const { service, post } = setup(
            {},
            { TELEGRAM_BOT_TOKEN: '333:a', TELEGRAM_ADMIN_CHAT_ID: '42' },
        );
        await expect(service.send('TELEGRAM_BOT_TOKEN')).resolves.toMatchObject(
            {
                ok: true,
            },
        );
        expect(post).toHaveBeenCalledWith(
            'https://api.telegram.org/bot333:a/sendMessage',
            expect.objectContaining({ chat_id: '42' }),
            expect.any(Object),
        );
    });

    it('клиентский бот без chat id — подсказка проверять у привязки портала', async () => {
        const { service, post } = setup(
            { CABINET_TELEGRAM_BOT_TOKEN: '111:c' },
            {},
        );
        const result = await service.send('CABINET_TELEGRAM_BOT_TOKEN');
        expect(result.ok).toBe(false);
        expect(result.message).toContain('карточке портала');
        expect(post).not.toHaveBeenCalled();
        await expect(
            service.send('CABINET_TELEGRAM_BOT_TOKEN', '777'),
        ).resolves.toMatchObject({ ok: true });
    });

    it('нет токена; чат не найден — понятные причины', async () => {
        await expect(
            setup({}, {}).service.send('SUPPORT_TELEGRAM_BOT_TOKEN'),
        ).resolves.toEqual({ ok: false, message: 'Токен бота не задан.' });

        const failing = setup(
            {
                SUPPORT_TELEGRAM_BOT_TOKEN: '222:s',
                SUPPORT_TELEGRAM_CHAT_ID: '-1',
            },
            {},
            'Bad Request: chat not found',
        );
        const result = await failing.service.send('SUPPORT_TELEGRAM_BOT_TOKEN');
        expect(result.ok).toBe(false);
        expect(result.message).toContain('бот добавлен в этот чат');
    });
});
