/**
 * Типизированные ошибки токен-сервиса маркетплейса.
 * Позволяют потребителям (admin-ручки, воркер provisioning) отличать
 * «портал спит >28 дней» от временной недоступности OAuth-сервера.
 */

export enum MarketplaceTokenErrorCode {
    /** Нет активной установки маркетплейс-приложения (или удалена) */
    NO_INSTALL = 'no_install',
    /** В установке нет refresh-токена (расшифровка не удалась / пусто) */
    NO_REFRESH_TOKEN = 'no_refresh_token',
    /**
     * refresh_token отклонён (invalid_grant): портал «спал» дольше 28 дней.
     * Лечится открытием приложения пользователем — /app перезапишет токены.
     */
    REFRESH_INVALID = 'refresh_invalid',
    /** OAuth-сервер Битрикса недоступен или ответил неожиданно */
    OAUTH_UNAVAILABLE = 'oauth_unavailable',
    /** Ключи локального приложения портала не внесены (garant_local:…) */
    APP_KEYS_MISSING = 'app_keys_missing',
    /**
     * Битрикс отверг ключи (wrong_client): внесённые client_id/secret не от
     * приложения, которое установлено на портале.
     */
    APP_KEYS_INVALID = 'app_keys_invalid',
}

export class MarketplaceTokenError extends Error {
    constructor(
        readonly code: MarketplaceTokenErrorCode,
        message: string,
    ) {
        super(message);
        this.name = 'MarketplaceTokenError';
    }
}
