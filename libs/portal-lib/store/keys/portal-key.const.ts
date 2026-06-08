/**
 * Ключи интеграций портала, которые хранятся в таблице `portal`
 * в зашифрованном виде. Значения union'а совпадают 1-в-1 с именами
 * колонок Prisma-модели `Portal`, поэтому используются напрямую как
 * имена полей при чтении/обновлении.
 */
export type PortalKeyName =
    | 'nestKey'
    | 'nestKonstructorKey'
    | 'nestReportKey'
    | 'nestEventsKey'
    | 'nestServiceKey'
    | 'nestWebhooksKey'
    | 'nestScheduleKey'
    | 'vibeKey';

/**
 * Runtime-список имён ключей. Единый источник правды для:
 * валидации path-параметра, Swagger `enum` и перебора всех ключей.
 * `satisfies` ловит расхождение с union {@link PortalKeyName}.
 */
export const PORTAL_KEY_NAMES = [
    'nestKey',
    'nestKonstructorKey',
    'nestReportKey',
    'nestEventsKey',
    'nestServiceKey',
    'nestWebhooksKey',
    'nestScheduleKey',
    'vibeKey',
] as const satisfies readonly PortalKeyName[];

/** Набор всех ключей портала (в открытом или зашифрованном виде). */
export type PortalKeysRecord = Record<PortalKeyName, string | null>;

/** Проверка, что произвольная строка — валидное имя ключа портала. */
export const isPortalKeyName = (value: string): value is PortalKeyName =>
    (PORTAL_KEY_NAMES as readonly string[]).includes(value);
