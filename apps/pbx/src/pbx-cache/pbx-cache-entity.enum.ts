/**
 * Сущности общих данных портала, которые кэширует приложение pbx-cache.
 * Эти данные переиспользуются разными приложениями монорепо и хранятся в Redis
 * (как правило — бессрочно, инвалидация ручная или по событию обновления портала).
 */
export const PBX_CACHE_ENTITIES = [
    'portal',
    'providers',
    'contracts',
    'favorites',
    'templates',
    'cache',
    'departments',
    'userFilters',
] as const;

/** Тип-объединение допустимых сущностей кэша (литералы из PBX_CACHE_ENTITIES). */
export type PbxCacheEntity = (typeof PBX_CACHE_ENTITIES)[number];
