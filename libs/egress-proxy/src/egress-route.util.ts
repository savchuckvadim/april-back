import {
    EGRESS_PROXY_ENV,
    EGRESS_TOKEN_HEADER,
    directRoute,
    type EgressProxyConfig,
    type EgressRoute,
} from './egress-proxy.types';

/** Конфиг из env; нет адреса или списка хостов — прокси выключен (null). */
export function parseEgressProxyConfig(
    get: (key: string) => string | undefined,
): EgressProxyConfig | null {
    const baseUrl = (get(EGRESS_PROXY_ENV.url) ?? '')
        .trim()
        .replace(/\/+$/, '');
    const hosts = parseEgressHosts(get(EGRESS_PROXY_ENV.hosts));
    if (!baseUrl || hosts.length === 0) return null;
    const token = (get(EGRESS_PROXY_ENV.token) ?? '').trim();
    return { baseUrl, token: token || null, hosts };
}

/** Хосты через запятую → нижний регистр, без пустых и дублей. */
export function parseEgressHosts(raw: string | undefined): string[] {
    const seen = new Set<string>();
    for (const part of (raw ?? '').split(',')) {
        const host = part.trim().toLowerCase();
        if (host) seen.add(host);
    }
    return [...seen];
}

/** Хост под правилом: точное совпадение, либо `.example.com` — сам домен и поддомены. */
export function isProxiedHost(host: string, hosts: readonly string[]): boolean {
    const target = host.toLowerCase();
    return hosts.some(rule =>
        rule.startsWith('.')
            ? target.endsWith(rule) || target === rule.slice(1)
            : target === rule,
    );
}

/**
 * Маршрут вызова: https-адрес к хосту из списка переписывается на
 * `<прокси>/<host><path><query>` и получает заголовок токена; остальное —
 * как есть. Адрес с нестандартным портом или не-https тоже уходит напрямую:
 * прокси ходит к upstream только по https:443. Некорректный адрес не
 * трогаем — ошибку даст сам fetch.
 */
export function routeEgress(
    url: string,
    config: EgressProxyConfig | null,
): EgressRoute {
    const direct = directRoute(url);
    if (!config) return direct;
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return direct;
    }
    if (
        parsed.protocol !== 'https:' ||
        parsed.port !== '' ||
        !isProxiedHost(parsed.hostname, config.hosts)
    ) {
        return direct;
    }
    return {
        url: `${config.baseUrl}/${parsed.hostname}${parsed.pathname}${parsed.search}`,
        headers: config.token ? { [EGRESS_TOKEN_HEADER]: config.token } : {},
        viaProxy: true,
    };
}

/** Заголовки вызова плюс заголовки маршрута (маршрут важнее при совпадении имён). */
export function mergeHeaders(
    base: HeadersInit | undefined,
    extra: Readonly<Record<string, string>>,
): Headers {
    const merged = new Headers(base);
    for (const [name, value] of Object.entries(extra)) {
        merged.set(name, value);
    }
    return merged;
}
