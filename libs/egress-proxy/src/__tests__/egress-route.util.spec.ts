import {
    isProxiedHost,
    mergeHeaders,
    parseEgressHosts,
    parseEgressProxyConfig,
    routeEgress,
} from '../egress-route.util';
import { EGRESS_TOKEN_HEADER } from '../egress-proxy.types';

const ENV: Record<string, string | undefined> = {
    EGRESS_PROXY_URL: 'https://eu-proxy.example.com/p/',
    EGRESS_PROXY_TOKEN: 'secret-token',
    EGRESS_PROXY_HOSTS: 'api.telegram.org, API.OpenAI.com,,.googleapis.com',
};

const configOf = (over: Record<string, string | undefined> = {}) =>
    parseEgressProxyConfig(key => ({ ...ENV, ...over })[key]);

describe('parseEgressProxyConfig', () => {
    it('адрес без хвостового слэша, токен и нормализованные хосты', () => {
        expect(configOf()).toEqual({
            baseUrl: 'https://eu-proxy.example.com/p',
            token: 'secret-token',
            hosts: ['api.telegram.org', 'api.openai.com', '.googleapis.com'],
        });
    });

    it('без адреса или без хостов прокси выключен', () => {
        expect(configOf({ EGRESS_PROXY_URL: '' })).toBeNull();
        expect(configOf({ EGRESS_PROXY_HOSTS: ' , ' })).toBeNull();
        expect(parseEgressProxyConfig(() => undefined)).toBeNull();
    });

    it('пустой токен — null (прокси без проверки)', () => {
        expect(configOf({ EGRESS_PROXY_TOKEN: '  ' })?.token).toBeNull();
    });

    it('parseEgressHosts убирает дубли', () => {
        expect(parseEgressHosts('a.com,A.COM,b.com')).toEqual([
            'a.com',
            'b.com',
        ]);
    });
});

describe('isProxiedHost', () => {
    const hosts = ['api.openai.com', '.googleapis.com'];

    it('точное совпадение без учёта регистра', () => {
        expect(isProxiedHost('API.openai.com', hosts)).toBe(true);
        expect(isProxiedHost('openai.com', hosts)).toBe(false);
    });

    it('правило с точкой — домен и его поддомены', () => {
        expect(isProxiedHost('generativelanguage.googleapis.com', hosts)).toBe(
            true,
        );
        expect(isProxiedHost('googleapis.com', hosts)).toBe(true);
        expect(isProxiedHost('evilgoogleapis.com', hosts)).toBe(false);
    });
});

describe('routeEgress', () => {
    const config = configOf();

    it('https к хосту из списка — через прокси с токеном, путь и query сохранены', () => {
        const route = routeEgress(
            'https://api.openai.com/v1/chat/completions?x=1',
            config,
        );
        expect(route).toEqual({
            url: 'https://eu-proxy.example.com/p/api.openai.com/v1/chat/completions?x=1',
            headers: { [EGRESS_TOKEN_HEADER]: 'secret-token' },
            viaProxy: true,
        });
    });

    it('хост вне списка, http и нестандартный порт — напрямую без заголовков', () => {
        for (const url of [
            'https://foundation-models.api.cloud.ru/v1/chat/completions',
            'http://api.openai.com/v1/models',
            'https://api.openai.com:8443/v1/models',
        ]) {
            expect(routeEgress(url, config)).toEqual({
                url,
                headers: {},
                viaProxy: false,
            });
        }
    });

    it('прокси выключен или адрес кривой — как есть', () => {
        expect(routeEgress('https://api.openai.com/v1', null).viaProxy).toBe(
            false,
        );
        expect(routeEgress('not a url', config)).toEqual({
            url: 'not a url',
            headers: {},
            viaProxy: false,
        });
    });

    it('без токена заголовков нет, но маршрут через прокси', () => {
        const route = routeEgress(
            'https://api.telegram.org/bot1/sendMessage',
            configOf({ EGRESS_PROXY_TOKEN: '' }),
        );
        expect(route.viaProxy).toBe(true);
        expect(route.headers).toEqual({});
    });
});

describe('mergeHeaders', () => {
    it('заголовки вызова сохраняются, заголовок маршрута добавляется', () => {
        const merged = mergeHeaders(
            { Authorization: 'Bearer k', 'Content-Type': 'application/json' },
            { [EGRESS_TOKEN_HEADER]: 't' },
        );
        expect(merged.get('authorization')).toBe('Bearer k');
        expect(merged.get('content-type')).toBe('application/json');
        expect(merged.get(EGRESS_TOKEN_HEADER)).toBe('t');
    });

    it('принимает Headers и undefined', () => {
        expect(mergeHeaders(new Headers({ a: '1' }), { b: '2' }).get('b')).toBe(
            '2',
        );
        expect(mergeHeaders(undefined, { b: '2' }).get('b')).toBe('2');
    });
});
