/**
 * Реквизиты доступа к порталу Битрикс24 для REST API 3.0.
 *
 * Библиотека намеренно не переиспользует BitrixCredentials из @lib/bitrix:
 * у v3 своя схема авторизации (auth в теле запроса для OAuth)
 * и свой формат URL (/rest/api/).
 */
export interface IBitrixV3Credentials {
    /** Домен портала, например `example.bitrix24.ru` */
    domain: string;
    /**
     * Входящий вебхук. Допустимые форматы:
     * - `rest/447/abc123`
     * - `/rest/447/abc123/`
     * - `https://example.bitrix24.ru/rest/447/abc123/`
     */
    webhook?: string;
    /** OAuth access token приложения (если не используется вебхук) */
    accessToken?: string;
}

/**
 * Минимальный контракт rate limiter'а.
 * Структурно совместим с BitrixRateLimiterService из @lib/bitrix —
 * транспорт не зависит от конкретного класса.
 */
export interface IBitrixV3RateLimiter {
    acquire(domain: string): Promise<void>;
}
