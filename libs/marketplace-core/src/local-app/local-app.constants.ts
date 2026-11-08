/**
 * Подключение портала локальным приложением «April»: что клиент вводит в
 * Битрикс24 (адреса, права) и что вносит к нам (client_id/secret).
 * Единый источник для инструкции в кабинете и в админке.
 */

/** Адрес нашего API по умолчанию (HANDLER'ы приложения). */
export const LOCAL_APP_DEFAULT_API_URL = 'https://api.pbx.april-app.ru';
/** Переменная с публичным адресом API (тот же, что у установки). */
export const LOCAL_APP_API_URL_ENV = 'MARKETPLACE_API_PUBLIC_URL';

/** Пути приложения на нашем API (глобальный префикс `api`). */
export const LOCAL_APP_PATHS = {
    /** «Путь обработчика» — открытие приложения из левого меню. */
    handler: '/api/bitrix-marketplace/app',
    /** «Путь для первоначальной установки». */
    install: '/api/bitrix-marketplace/install',
} as const;

/** Права (scope) локального приложения — отметить в Битрикс24. */
export const LOCAL_APP_SCOPES = [
    'crm',
    'user',
    'user_brief',
    'placement',
    'task',
    'tasks',
    'im',
    'imbot',
    'disk',
    'lists',
    'rpa',
    'department',
    'calendar',
    'telephony',
    'bizproc',
    'userfieldconfig',
    'event',
    'entity',
] as const;

/** Раздел «Разработчикам → Другое» портала, где создают локальное приложение. */
export function localAppDevSectionUrl(domain: string): string {
    return `https://${domain}/devops/section/standard/`;
}

/**
 * Код приложения Битрикса для локального приложения: `local.<id>.<число>`
 * (например `local.5f1a2b3c4d5e6.12345678`).
 */
export const LOCAL_APP_CLIENT_ID_RE = /^local\.[a-z0-9]+\.[a-z0-9]+$/i;
/** Ключ приложения: без пробелов, разумной длины. */
export const LOCAL_APP_CLIENT_SECRET_RE = /^\S{10,200}$/;

/** Итог проверки ключей пробным обновлением токена. */
export const LOCAL_APP_CHECK_RESULTS = [
    'ok',
    'no_keys',
    'not_installed',
    'keys_invalid',
    'reopen_app',
    'unavailable',
] as const;
export type LocalAppCheckResult = (typeof LOCAL_APP_CHECK_RESULTS)[number];
