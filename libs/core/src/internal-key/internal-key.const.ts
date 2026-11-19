/**
 * Служебный ключ April: ручки, которыми пользуется только наша команда
 * (ручные прогоны конвейера звонков, распознавание по запросу, разборы
 * моделью, массовые прогоны по порталу). Наружу они торчат вместе с
 * приложением (api.event-sales.april-app.ru) и без проверки запускали
 * платную работу и запись в Битрикс клиента любому, кто знает адрес.
 *
 * Режим guard'а (переменная окружения `APRIL_INTERNAL_GUARD_MODE`), как у
 * сессии портала (`PORTAL_SESSION_GUARD_MODE`):
 * - `off` — проверок и журнала нет;
 * - `report` (по умолчанию) — запрос без верного ключа ПРОПУСКАЕТСЯ, в
 *   журнал пишется предупреждение (маршрут, IP, домен, user-agent) не чаще
 *   раза в минуту на маршрут: сначала смотрим, кто стучится, и ничего не
 *   ломаем;
 * - `enforce` — без верного ключа 403.
 * Верный ключ пропускает в любом режиме.
 */

/** Переменная окружения с ключом — корневой `.env` (общий для всех приложений). */
export const APRIL_INTERNAL_API_KEY_ENV = 'APRIL_INTERNAL_API_KEY';

/** Переменная окружения с режимом guard'а. */
export const APRIL_INTERNAL_GUARD_MODE_ENV = 'APRIL_INTERNAL_GUARD_MODE';

export const INTERNAL_KEY_GUARD_MODES = ['off', 'report', 'enforce'] as const;

export type InternalKeyGuardMode = (typeof INTERNAL_KEY_GUARD_MODES)[number];

export const INTERNAL_KEY_GUARD_MODE_DEFAULT: InternalKeyGuardMode = 'report';

/** Разбор значения переменной окружения; пусто или неизвестное → `report`. */
export function parseInternalKeyGuardMode(
    raw: string | undefined,
): InternalKeyGuardMode {
    const value = raw?.trim().toLowerCase() ?? '';
    return (INTERNAL_KEY_GUARD_MODES as readonly string[]).includes(value)
        ? (value as InternalKeyGuardMode)
        : INTERNAL_KEY_GUARD_MODE_DEFAULT;
}

/** Почему запрос не прошёл проверку: в enforce — 403, в report — строка журнала. */
export const INTERNAL_KEY_REJECT_REASONS = [
    'key_not_configured',
    'missing_key',
    'invalid_key',
] as const;

export type InternalKeyRejectReason =
    (typeof INTERNAL_KEY_REJECT_REASONS)[number];

/** Заголовок, в котором служебный вызов передаёт ключ. */
export const APRIL_INTERNAL_KEY_HEADER = 'x-april-internal-key';

/** Имя схемы безопасности в Swagger (кнопка Authorize). */
export const APRIL_INTERNAL_KEY_SECURITY = 'april-internal-key';

/** Метка ручки «только по служебному ключу» (для проверок поверхности API). */
export const APRIL_INTERNAL_KEY_PROTECTED = 'april-internal-key:protected';

/** Начало строки журнала в режиме report — по нему ищем в «Журналах» админки. */
export const INTERNAL_KEY_REPORT_MARKER = 'internal-key (report)';

/** Не чаще одной строки журнала на маршрут за это время. */
export const INTERNAL_KEY_REPORT_INTERVAL_MS = 60_000;

/** Описание схемы в Swagger: где взять ключ и куда его класть. */
export const APRIL_INTERNAL_KEY_SCHEME_DESCRIPTION =
    'Служебный ключ April (переменная окружения APRIL_INTERNAL_API_KEY). ' +
    'Нужен ручкам «только для служебных вызовов»: передаётся заголовком ' +
    'x-april-internal-key.';

/** Ответ 403 в Swagger у закрытых ручек. */
export const APRIL_INTERNAL_KEY_FORBIDDEN_DESCRIPTION =
    'Только для служебных вызовов: нужен заголовок x-april-internal-key ' +
    'со служебным ключом (APRIL_INTERNAL_API_KEY). В режиме ' +
    'APRIL_INTERNAL_GUARD_MODE=enforce без верного ключа — 403; в report ' +
    '(по умолчанию) запрос проходит, обращение пишется в журнал.';
