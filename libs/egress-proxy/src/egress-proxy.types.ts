/**
 * Исходящий прокси за рубеж (план
 * ai/tasks/2026-10-29-ai-providers-per-portal-byok-plan.md, раздел «Прокси»):
 * часть внешних API (OpenAI, Groq, Anthropic, Telegram…) не отвечает серверам
 * из РФ. Вызовы к хостам из списка уходят через наш обратный прокси на
 * европейском сервере — `https://<прокси>/p/<host>/<path>` с заголовком-токеном;
 * остальные хосты (Битрикс, Яндекс, VibeCode, Cloud.ru) — напрямую.
 */

/** Имена env-переменных прокси — единственное место, где они перечислены. */
export const EGRESS_PROXY_ENV = {
    /** Адрес прокси с префиксом пути, например `https://eu-proxy.example.com/p`. */
    url: 'EGRESS_PROXY_URL',
    /** Токен, который прокси требует в заголовке {@link EGRESS_TOKEN_HEADER}. */
    token: 'EGRESS_PROXY_TOKEN',
    /** Хосты через запятую; `.example.com` — вместе со всеми поддоменами. */
    hosts: 'EGRESS_PROXY_HOSTS',
} as const;

/** Заголовок с токеном: прокси его проверяет и наружу не пропускает. */
export const EGRESS_TOKEN_HEADER = 'X-Egress-Token';

export interface EgressProxyConfig {
    /** Адрес прокси без хвостового слэша. */
    baseUrl: string;
    /** Токен; null — прокси без проверки (только локальные стенды). */
    token: string | null;
    /** Правила хостов в нижнем регистре. */
    hosts: readonly string[];
}

/** Куда реально пойдёт запрос и какие заголовки добавить. */
export interface EgressRoute {
    url: string;
    headers: Readonly<Record<string, string>>;
    viaProxy: boolean;
}

/** Маршрут «как есть» — для потребителей, у которых прокси не подключён. */
export const directRoute = (url: string): EgressRoute => ({
    url,
    headers: {},
    viaProxy: false,
});

/** Что показать в админке: включён ли прокси и какие хосты через него ходят. */
export interface EgressProxyStatus {
    enabled: boolean;
    /** Хост прокси без пути и токена — для чек-листа готовности. */
    proxyHost: string | null;
    hosts: readonly string[];
}
