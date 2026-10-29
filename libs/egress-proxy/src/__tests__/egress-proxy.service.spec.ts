import { Logger } from '@nestjs/common';
import type { VendorSettingsReader } from '@lib/vendor-settings';
import { EgressProxyService } from '../egress-proxy.service';
import { EGRESS_TOKEN_HEADER } from '../egress-proxy.types';

const makeService = (
    values: Record<string, string> = {},
    settings?: VendorSettingsReader,
) =>
    new EgressProxyService(
        {
            get: (key: string) => values[key],
        } as never,
        settings,
    );

/** Читатель настроек вендора с фиксированными значениями (без env). */
const readerOf = (admin: Record<string, string>): VendorSettingsReader => ({
    get: key => Promise.resolve(admin[key] ?? null),
    getMany: keys =>
        Promise.resolve(
            Object.fromEntries(keys.map(key => [key, admin[key] ?? null])),
        ),
});

const ENABLED = {
    EGRESS_PROXY_URL: 'https://eu-proxy.example.com/p',
    EGRESS_PROXY_TOKEN: 'tok',
    EGRESS_PROXY_HOSTS: 'api.openai.com',
};

describe('EgressProxyService', () => {
    let fetchMock: jest.Mock;

    beforeEach(() => {
        fetchMock = jest.fn().mockResolvedValue(new Response('{}'));
        global.fetch = fetchMock as unknown as typeof fetch;
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    it('без env выключен: fetch идёт напрямую с теми же аргументами', async () => {
        const service = makeService();
        const init = { method: 'POST', headers: { a: '1' } };
        await service.fetch('https://api.openai.com/v1/models', init);
        expect(service.enabled).toBe(false);
        expect(service.status()).toEqual({
            enabled: false,
            proxyHost: null,
            hosts: [],
        });
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.openai.com/v1/models',
            init,
        );
    });

    it('хост из списка — адрес переписан, токен добавлен к заголовкам вызова', async () => {
        const service = makeService(ENABLED);
        await service.fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: { Authorization: 'Bearer k' },
        });
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(
            'https://eu-proxy.example.com/p/api.openai.com/v1/models',
        );
        expect(init.method).toBe('GET');
        const headers = init.headers as Headers;
        expect(headers.get('authorization')).toBe('Bearer k');
        expect(headers.get(EGRESS_TOKEN_HEADER)).toBe('tok');
    });

    it('хост вне списка при включённом прокси — напрямую', async () => {
        const service = makeService(ENABLED);
        await service.fetch('https://api.telegram.org/bot1/getMe');
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.telegram.org/bot1/getMe',
            {},
        );
        expect(service.isProxied('https://api.telegram.org/bot1/getMe')).toBe(
            false,
        );
        expect(service.isProxied('https://api.openai.com/v1')).toBe(true);
    });

    it('status: хост прокси без пути, токен не раскрывается', () => {
        expect(makeService(ENABLED).status()).toEqual({
            enabled: true,
            proxyHost: 'eu-proxy.example.com',
            hosts: ['api.openai.com'],
        });
    });

    it('настройки из админки важнее env: fetch ждёт свежий снимок, route() и status() обновляются следом', async () => {
        const service = makeService(
            ENABLED,
            readerOf({
                EGRESS_PROXY_URL: 'https://admin-proxy.example.com/p/',
                EGRESS_PROXY_TOKEN: 'admin-tok',
                EGRESS_PROXY_HOSTS: 'api.groq.com',
            }),
        );
        // До первого чтения действует снимок из env.
        expect(service.status().proxyHost).toBe('eu-proxy.example.com');

        await service.fetch('https://api.groq.com/openai/v1/models');

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(
            'https://admin-proxy.example.com/p/api.groq.com/openai/v1/models',
        );
        expect((init.headers as Headers).get(EGRESS_TOKEN_HEADER)).toBe(
            'admin-tok',
        );
        expect(service.status()).toEqual({
            enabled: true,
            proxyHost: 'admin-proxy.example.com',
            hosts: ['api.groq.com'],
        });
        expect(service.isProxied('https://api.openai.com/v1')).toBe(false);
    });

    it('читатель настроек упал — прежний снимок из env, предупреждение, вызов не падает', async () => {
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        const service = makeService(ENABLED, {
            get: () => Promise.reject(new Error('db down')),
            getMany: () => Promise.reject(new Error('db down')),
        });
        await service.fetch('https://api.openai.com/v1/models');
        const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(
            'https://eu-proxy.example.com/p/api.openai.com/v1/models',
        );
        expect(warn).toHaveBeenCalledTimes(1);
    });
});
