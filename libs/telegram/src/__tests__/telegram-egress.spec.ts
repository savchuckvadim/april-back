import { of } from 'rxjs';
import { TelegramService } from '../telegram.service';

const CFG: Record<string, string> = {
    WITH_TELEGRAM: 'true',
    TELEGRAM_BOT_TOKEN: 't0k',
    TELEGRAM_ADMIN_CHAT_ID: '-100',
    APP_NAME: 'event-sales',
};

const configService = { get: (key: string) => CFG[key] };

interface EgressStub {
    route: (url: string) => {
        url: string;
        headers: Record<string, string>;
        viaProxy: boolean;
    };
    status: () => {
        enabled: boolean;
        proxyHost: string | null;
        hosts: string[];
    };
}

/** Как EgressProxyService с api.telegram.org в списке хостов. */
const proxiedEgress: EgressStub = {
    route: url => ({
        url: `https://eu-proxy.example.com/p/api.telegram.org${new URL(url).pathname}`,
        headers: { 'X-Egress-Token': 'secret' },
        viaProxy: true,
    }),
    status: () => ({
        enabled: true,
        proxyHost: 'eu-proxy.example.com',
        hosts: ['api.telegram.org'],
    }),
};

/** Прокси включён, но Telegram в список хостов не добавили. */
const proxyWithoutTelegram: EgressStub = {
    route: url => ({ url, headers: {}, viaProxy: false }),
    status: () => ({
        enabled: true,
        proxyHost: 'eu-proxy.example.com',
        hosts: ['api.groq.com'],
    }),
};

/** Прокси не настроен вовсе. */
const noProxy: EgressStub = {
    route: url => ({ url, headers: {}, viaProxy: false }),
    status: () => ({ enabled: false, proxyHost: null, hosts: [] }),
};

const makeService = (egress: EgressStub) => {
    const post = jest.fn().mockReturnValue(of({ data: {} }));
    const service = new TelegramService(
        { post } as never,
        configService as never,
        egress as never,
    );
    const warn = jest
        .spyOn(service['logger'], 'warn')
        .mockImplementation(() => undefined);
    return { service, post, warn };
};

/**
 * Тревоги в Telegram через исходящий прокси: при включённом прокси адрес
 * Bot API переписывается и токен прокси едет заголовком. Прямой путь
 * остаётся (например, дев-машина вне РФ), но сопровождается одним
 * предупреждением — с российского сервера такие сообщения пропадут.
 */
describe('Telegram — исходящий прокси', () => {
    it('через прокси: адрес переписан, заголовок с токеном, предупреждений нет', async () => {
        const { service, post, warn } = makeService(proxiedEgress);
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
        expect(warn).not.toHaveBeenCalled();
    });

    it('прокси есть, но api.telegram.org не в списке — напрямую двумя аргументами и одно предупреждение про список', async () => {
        const { service, post, warn } = makeService(proxyWithoutTelegram);
        await service.sendMessage('hi');
        await service.sendMessage('again');
        expect(post.mock.calls[0]).toHaveLength(2);
        const [url] = post.mock.calls[0] as [string, unknown];
        expect(url).toBe('https://api.telegram.org/bott0k/sendMessage');
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain(
            'нет в списке хостов прокси (api.groq.com)',
        );
    });

    it('прокси не настроен — напрямую и предупреждение «прокси не настроен»', async () => {
        const { service, post, warn } = makeService(noProxy);
        await service.sendMessage('hi');
        expect(post.mock.calls[0]).toHaveLength(2);
        expect(String(warn.mock.calls[0][0])).toContain(
            'исходящий прокси не настроен',
        );
    });
});
