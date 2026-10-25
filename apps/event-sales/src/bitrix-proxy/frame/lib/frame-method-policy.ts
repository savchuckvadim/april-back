/**
 * КАКИЕ МЕТОДЫ БИТРИКСА ФРЕЙМ МОЖЕТ ВЫЗВАТЬ ЧЕРЕЗ СЕРВЕР.
 *
 * Сервер выполняет запрос вебхуком портала — с правами администратора.
 * Поэтому прокси повторяет только то, что делает само приложение «Звонки»:
 * CRM, задачи, списки, уведомления, чтение пользователей и отделов.
 * Удаление, правка пользователей и отделов, смена настроек CRM — нет:
 * приложение их не вызывает (проверено по коду фронта 25.10.2026), а
 * через вебхук они дали бы любому сотруднику права администратора.
 */

/** Семейства методов, которые вызывает фронт «Звонков». */
const ALLOWED_PREFIXES = [
    'crm.',
    'tasks.',
    'task.',
    'lists.',
    'disk.',
    'catalog.',
    'rpa.',
    'im.notify.',
    'calendar.',
] as const;

/** Отдельные методы без своего семейства. */
const ALLOWED_EXACT = new Set<string>([
    'user.get',
    'user.current',
    'user.search',
    'department.get',
    'userfieldconfig.list',
    'userfieldconfig.get',
]);

/** Внутри разрешённых семейств — запрещено всегда. */
const DENIED_PATTERNS: readonly RegExp[] = [
    // Удаление чего угодно: фронт ничего не удаляет.
    /\.(delete|deletetree|markdeleted)$/,
    // Настройки CRM: поля, стадии, воронки, типы смарт-процессов.
    /^crm\.([a-z]+\.)*userfield\.(add|update)$/,
    /^crm\.(status|category|type|enum)\.(add|update)$/,
    // Права и настройки задач/дисков уровня портала.
    /^disk\.(storage|rights)\./,
];

export const FRAME_PROXY_METHOD_PATTERN = /^[a-z][a-z0-9_.]*$/;

/** Можно ли выполнить метод через сервер по просьбе фрейма. */
export function isFrameMethodAllowed(method: string): boolean {
    const name = method.trim().toLowerCase();
    if (!FRAME_PROXY_METHOD_PATTERN.test(name)) return false;
    if (DENIED_PATTERNS.some(pattern => pattern.test(name))) return false;
    if (ALLOWED_EXACT.has(name)) return true;
    return ALLOWED_PREFIXES.some(prefix => name.startsWith(prefix));
}
