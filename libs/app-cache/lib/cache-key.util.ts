/**
 * Схема ключей Redis центрального кэша.
 *
 * `app-cache:{app}:{domain}:{bxUserId}:{key}` — зеркалирует уникальный
 * ключ таблицы app_cache (portal_id + app + key + bx_user_id), но в
 * человекочитаемом виде: домен вместо id портала, чтобы ключи было
 * удобно смотреть глазами в redis-cli.
 */
export const APP_CACHE_PREFIX = 'app-cache';

export function buildAppCacheRedisKey(
    app: string,
    domain: string,
    bxUserId: number | bigint,
    key: string,
): string {
    return `${APP_CACHE_PREFIX}:${app}:${domain}:${bxUserId}:${key}`;
}

/** SCAN-паттерн по необязательным app/domain (остальное — звёздочки). */
export function buildAppCacheRedisPattern(app?: string, domain?: string): string {
    return `${APP_CACHE_PREFIX}:${app ?? '*'}:${domain ?? '*'}:*`;
}
