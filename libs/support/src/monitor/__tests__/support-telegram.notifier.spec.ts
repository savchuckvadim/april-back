import { of, throwError } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { SupportTelegramNotifier } from '../infrastructure/support-telegram.notifier';

function setup(
    env: Record<string, string | undefined>,
    egress: { route: (url: string) => unknown } = directEgress,
) {
    const http = {
        post: jest.fn().mockReturnValue(of({ data: { ok: true } })),
    };
    const config = { get: jest.fn((key: string) => env[key]) };
    const notifier = new SupportTelegramNotifier(
        http as unknown as HttpService,
        config as unknown as ConfigService,
        egress as never,
    );
    return { notifier, http };
}

/** Прокси выключен: адрес как есть, без заголовков (прокси — в отдельной спеке). */
const directEgress = {
    route: (url: string) => ({ url, headers: {}, viaProxy: false }),
};

const CONFIGURED = {
    SUPPORT_TELEGRAM_BOT_TOKEN: '123:abc',
    SUPPORT_TELEGRAM_CHAT_ID: '-100500',
};

describe('SupportTelegramNotifier', () => {
    it('не настроен — молчит и не ходит в сеть', async () => {
        const { notifier, http } = setup({ SUPPORT_TELEGRAM_BOT_TOKEN: 'x' });
        expect(notifier.isConfigured()).toBe(false);
        expect(await notifier.send('<b>hi</b>')).toBe(false);
        expect(http.post).not.toHaveBeenCalled();
    });

    it('шлёт HTML в чат поддержки отдельного бота', async () => {
        const { notifier, http } = setup(CONFIGURED);
        expect(notifier.isConfigured()).toBe(true);
        expect(await notifier.send('<b>hi</b>')).toBe(true);
        expect(http.post).toHaveBeenCalledWith(
            'https://api.telegram.org/bot123:abc/sendMessage',
            {
                chat_id: '-100500',
                text: '<b>hi</b>',
                parse_mode: 'HTML',
                disable_web_page_preview: true,
            },
            { timeout: 15_000 },
        );
    });

    it('ошибка Telegram не роняет такт — false', async () => {
        const { notifier, http } = setup(CONFIGURED);
        http.post.mockReturnValueOnce(
            throwError(() => new Error('Request failed with status code 400')),
        );
        expect(await notifier.send('x')).toBe(false);
    });

    it('длинный текст обрезается до лимита Telegram', async () => {
        const { notifier, http } = setup(CONFIGURED);
        await notifier.send('я'.repeat(5000));
        const body = (http.post.mock.calls[0] as unknown[])[1] as {
            text: string;
        };
        expect(body.text).toHaveLength(4096);
    });
});

describe('SupportTelegramNotifier — бот поддержки', () => {
    it('sendTo: кнопки и ответ на сообщение уходят только когда заданы; возвращает message_id', async () => {
        const { notifier, http } = setup(CONFIGURED);
        http.post.mockReturnValue(
            of({ data: { ok: true, result: { message_id: 77 } } }),
        );
        const keyboard = [[{ text: 'Отправить', callback_data: 'sa:send:1' }]];
        expect(
            await notifier.sendTo(500, '<b>черновик</b>', {
                replyMarkup: keyboard,
                replyToMessageId: 12,
            }),
        ).toBe(77);
        expect(http.post).toHaveBeenCalledWith(
            'https://api.telegram.org/bot123:abc/sendMessage',
            expect.objectContaining({
                chat_id: 500,
                reply_markup: { inline_keyboard: keyboard },
                reply_to_message_id: 12,
            }),
            { timeout: 15_000 },
        );
        const plain = (await notifier.sendTo(500, 'x'),
        http.post.mock.calls[1] as unknown[])[1] as Record<string, unknown>;
        expect(plain).not.toHaveProperty('reply_markup');
    });

    it('sendTo без токена — null, в сеть не ходит', async () => {
        const { notifier, http } = setup({});
        expect(await notifier.sendTo(1, 'x')).toBeNull();
        expect(http.post).not.toHaveBeenCalled();
    });

    it('answerCallback и clearKeyboard: ошибки Telegram глотаются', async () => {
        const { notifier, http } = setup(CONFIGURED);
        http.post.mockReturnValue(throwError(() => new Error('400')));
        await expect(
            notifier.answerCallback('cb1', 'ок'),
        ).resolves.toBeUndefined();
        await expect(notifier.clearKeyboard(500, 77)).resolves.toBeUndefined();
        expect(http.post).toHaveBeenCalledWith(
            'https://api.telegram.org/bot123:abc/answerCallbackQuery',
            { callback_query_id: 'cb1', text: 'ок' },
            { timeout: 15_000 },
        );
        expect(http.post).toHaveBeenCalledWith(
            'https://api.telegram.org/bot123:abc/editMessageReplyMarkup',
            {
                chat_id: 500,
                message_id: 77,
                reply_markup: { inline_keyboard: [] },
            },
            { timeout: 15_000 },
        );
    });

    it('isChatMember: участник, администратор — да; вышел или ошибка — нет', async () => {
        const { notifier, http } = setup(CONFIGURED);
        http.post.mockReturnValueOnce(
            of({ data: { ok: true, result: { status: 'administrator' } } }),
        );
        expect(await notifier.isChatMember(42)).toBe(true);
        expect(http.post).toHaveBeenCalledWith(
            'https://api.telegram.org/bot123:abc/getChatMember',
            { chat_id: '-100500', user_id: 42 },
            { timeout: 15_000 },
        );
        http.post.mockReturnValueOnce(
            of({ data: { ok: true, result: { status: 'left' } } }),
        );
        expect(await notifier.isChatMember(42)).toBe(false);
        http.post.mockReturnValueOnce(throwError(() => new Error('403')));
        expect(await notifier.isChatMember(42)).toBe(false);
    });

    it('setWebhook: адрес, секрет и только нужные типы обновлений; ошибка пробрасывается', async () => {
        const { notifier, http } = setup(CONFIGURED);
        await notifier.setWebhook(
            'https://api.bot.april-app.ru/api/support/telegram/webhook',
            's3cret',
        );
        expect(http.post).toHaveBeenCalledWith(
            'https://api.telegram.org/bot123:abc/setWebhook',
            {
                url: 'https://api.bot.april-app.ru/api/support/telegram/webhook',
                secret_token: 's3cret',
                allowed_updates: ['message', 'callback_query'],
            },
            { timeout: 15_000 },
        );
        http.post.mockReturnValueOnce(throwError(() => new Error('401')));
        await expect(notifier.setWebhook('https://x', 's')).rejects.toThrow(
            '401',
        );
    });
});
