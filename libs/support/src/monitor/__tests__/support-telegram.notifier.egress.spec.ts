import { of } from 'rxjs';
import { SupportTelegramNotifier } from '../infrastructure/support-telegram.notifier';

const ENV: Record<string, string> = {
    SUPPORT_TELEGRAM_BOT_TOKEN: '123:abc',
    SUPPORT_TELEGRAM_CHAT_ID: '-100500',
};

/** Как EgressProxyService с api.telegram.org в EGRESS_PROXY_HOSTS. */
const proxiedEgress = {
    route: (url: string) => {
        const parsed = new URL(url);
        return {
            url: `https://eu-proxy.example.com/p/${parsed.hostname}${parsed.pathname}`,
            headers: { 'X-Egress-Token': 'tok' },
            viaProxy: true,
        };
    },
};

const directEgress = {
    route: (url: string) => ({ url, headers: {}, viaProxy: false }),
};

const setup = (egress: typeof proxiedEgress | typeof directEgress) => {
    const http = {
        post: jest.fn().mockReturnValue(of({ data: { ok: true } })),
    };
    const notifier = new SupportTelegramNotifier(
        http as never,
        { get: (key: string) => ENV[key] } as never,
        egress as never,
    );
    return { notifier, http };
};

/**
 * Бот поддержки через исходящий прокси: адрес Bot API переписывается на
 * прокси, токен прокси едет заголовком, таймаут сохраняется; при выключенном
 * прокси вызов не меняется (ровно `{ timeout }`, без лишних заголовков).
 */
describe('SupportTelegramNotifier — исходящий прокси', () => {
    it('через прокси: адрес переписан, заголовок с токеном, таймаут на месте', async () => {
        const { notifier, http } = setup(proxiedEgress);
        await notifier.send('<b>hi</b>');
        const [url, , options] = http.post.mock.calls[0] as [
            string,
            unknown,
            { timeout: number; headers?: Record<string, string> },
        ];
        expect(url).toBe(
            'https://eu-proxy.example.com/p/api.telegram.org/bot123:abc/sendMessage',
        );
        expect(options.timeout).toBe(15_000);
        expect(options.headers).toEqual({ 'X-Egress-Token': 'tok' });
    });

    it('без прокси: прямой адрес и только таймаут в опциях', async () => {
        const { notifier, http } = setup(directEgress);
        await notifier.send('hi');
        const [url, , options] = http.post.mock.calls[0] as [
            string,
            unknown,
            Record<string, unknown>,
        ];
        expect(url).toBe('https://api.telegram.org/bot123:abc/sendMessage');
        expect(options).toEqual({ timeout: 15_000 });
    });
});
