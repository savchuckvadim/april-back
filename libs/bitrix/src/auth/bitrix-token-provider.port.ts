/**
 * Порт (абстракция) поставщика свежего OAuth-токена для портала.
 *
 * Библиотека Bitrix объявляет этот контракт, но НЕ реализует его:
 * реализация (обновление токена, доступ к БД приложений/токенов)
 * живёт в мире auth (libs/bitrix-auth) и подставляется в
 * композиционном корне (PBXModule) через DI-токен ниже.
 */
export interface IBitrixTokenProvider {
    /**
     * Возвращает валидный access-токен для домена,
     * при необходимости обновляя его по refresh-токену.
     */
    getFreshToken(domain: string): Promise<string>;
}

/** DI-токен для связывания порта с реализацией из libs/bitrix-auth. */
export const BITRIX_TOKEN_PROVIDER = Symbol('BITRIX_TOKEN_PROVIDER');
