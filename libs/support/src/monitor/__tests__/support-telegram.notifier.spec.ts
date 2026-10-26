import { of, throwError } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { SupportTelegramNotifier } from '../infrastructure/support-telegram.notifier';

function setup(env: Record<string, string | undefined>) {
    const http = {
        post: jest.fn().mockReturnValue(of({ data: { ok: true } })),
    };
    const config = { get: jest.fn((key: string) => env[key]) };
    const notifier = new SupportTelegramNotifier(
        http as unknown as HttpService,
        config as unknown as ConfigService,
    );
    return { notifier, http };
}

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
