import { of } from 'rxjs';
import { TelegramOriginalService } from '../telegram-original.service';
import { TelegramService } from '../telegram.service';

const CFG: Record<string, string> = {
    WITH_TELEGRAM: 'true',
    TELEGRAM_BOT_TOKEN: 't0k',
    TELEGRAM_ADMIN_CHAT_ID: '-100',
    APP_NAME: 'event-sales',
};

const configService = { get: (key: string) => CFG[key] };

/** Как EgressProxyService с api.telegram.org в EGRESS_PROXY_HOSTS. */
const proxiedEgress = {
    route: (url: string) => ({
        url: `https://eu-proxy.example.com/p/api.telegram.org${new URL(url).pathname}`,
        headers: { 'X-Egress-Token': 'secret' },
        viaProxy: true,
    }),
};

const directEgress = {
    route: (url: string) => ({ url, headers: {}, viaProxy: false }),
};

const makePost = () => jest.fn().mockReturnValue(of({ data: {} }));

/**
 * Тревоги в Telegram через исходящий прокси: при включённом прокси адрес
 * Bot API переписывается и токен прокси едет заголовком; при выключенном
 * или не подключённом (модули без TelegramModule) — вызов прежний, двумя
 * аргументами, чтобы ничего не менять для существующих потребителей.
 */
describe('Telegram — исходящий прокси', () => {
    it('TelegramService через прокси: адрес переписан, заголовок с токеном', async () => {
        const post = makePost();
        const service = new TelegramService(
            { post } as never,
            configService as never,
            proxiedEgress as never,
        );
        await service.sendMessage('hi');
        const [url, , options] = post.mock.calls[0] as [
            string,
            unknown,
            { headers: Record<string, string> },
        ];
        expect(url).toBe(
            'https://eu-proxy.example.com/p/api.telegram.org/bott0k/sendMessage',
        );
        expect(options.headers).toEqual({ 'X-Egress-Token': 'secret' });
    });

    it('TelegramService: прокси выключен — прямой адрес и два аргумента', async () => {
        const post = makePost();
        const service = new TelegramService(
            { post } as never,
            configService as never,
            directEgress as never,
        );
        await service.sendMessage('hi');
        expect(post.mock.calls[0]).toHaveLength(2);
        const [url] = post.mock.calls[0] as [string, unknown];
        expect(url).toBe('https://api.telegram.org/bott0k/sendMessage');
    });

    it('TelegramService без EgressProxyService (модуль без прокси) — напрямую', async () => {
        const post = makePost();
        const service = new TelegramService(
            { post } as never,
            configService as never,
        );
        await service.sendMessage('hi');
        expect(post.mock.calls[0]).toHaveLength(2);
    });

    it('TelegramOriginalService через прокси и без него', async () => {
        const proxiedPost = makePost();
        await new TelegramOriginalService(
            { post: proxiedPost } as never,
            configService as never,
            proxiedEgress as never,
        ).sendMessage('hi');
        const [proxiedUrl] = proxiedPost.mock.calls[0] as [string, unknown];
        expect(proxiedUrl).toBe(
            'https://eu-proxy.example.com/p/api.telegram.org/bott0k/sendMessage',
        );

        const directPost = makePost();
        await new TelegramOriginalService(
            { post: directPost } as never,
            configService as never,
        ).sendMessage('hi');
        expect(directPost.mock.calls[0]).toHaveLength(2);
        const [directUrl] = directPost.mock.calls[0] as [string, unknown];
        expect(directUrl).toBe('https://api.telegram.org/bott0k/sendMessage');
    });
});
