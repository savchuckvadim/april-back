/**
 * Константы portal-context сессии: обмен AUTH_ID фрейма Bitrix24 на JWT
 * библиотеки (`@lib/auth`, общий секрет → SSO между приложениями) и
 * guard мутирующих ручек, которые принимают `requesterUserId` в теле.
 *
 * Режим guard'а (переменная окружения `PORTAL_SESSION_GUARD_MODE`):
 * - `off` — проверок нет (поведение до появления guard'а);
 * - `report` — токен проверяется, нарушения пишутся в лог, запрос
 *   пропускается: бэк можно выкатить раньше фронта, который ещё не шлёт
 *   Bearer, и по логам увидеть, что фронт уже перешёл на токен;
 * - `enforce` — нарушения отклоняются: 401 (нет/просрочен токен),
 *   403 (чужой портал или пользователь).
 */
export const PORTAL_SESSION_GUARD_MODES = ['off', 'report', 'enforce'] as const;

export type PortalSessionGuardMode =
    (typeof PORTAL_SESSION_GUARD_MODES)[number];

export const PORTAL_SESSION_GUARD_MODE_DEFAULT: PortalSessionGuardMode =
    'report';

export const PORTAL_SESSION_GUARD_MODE_ENV = 'PORTAL_SESSION_GUARD_MODE';

/** Разбор значения переменной окружения; неизвестное → режим по умолчанию. */
export function parsePortalSessionGuardMode(
    raw: string | undefined,
): PortalSessionGuardMode {
    const value = raw?.trim().toLowerCase() ?? '';
    return (PORTAL_SESSION_GUARD_MODES as readonly string[]).includes(value)
        ? (value as PortalSessionGuardMode)
        : PORTAL_SESSION_GUARD_MODE_DEFAULT;
}

/** Путь ручки обмена (без глобального префикса приложения). */
export const PORTAL_SESSION_ROUTE = 'auth/portal-session';

export const PORTAL_SESSION_SWAGGER_TAG = 'Portal Session';

/** Причины отказа guard'а: в enforce — код ответа, в report — текст лога. */
export const PORTAL_SESSION_REJECT_REASONS = [
    'missing_token',
    'invalid_token',
    'wrong_role',
    'domain_mismatch',
    'requester_mismatch',
] as const;

export type PortalSessionRejectReason =
    (typeof PORTAL_SESSION_REJECT_REASONS)[number];

/** Причины отказа в открытии сессии (обмен AUTH_ID). */
export const PORTAL_SESSION_OPEN_FAILURES = [
    'bad_domain',
    'rest_verify_failed',
] as const;

export type PortalSessionOpenFailure =
    (typeof PORTAL_SESSION_OPEN_FAILURES)[number];

/** Таймаут REST-проверки токена на портале. */
export const BITRIX_PROFILE_TIMEOUT_MS = 15_000;

/**
 * Домен портала — только имя хоста (метки через точку, без схемы, пути и
 * порта): REST-проверка идёт на `https://{domain}/rest/profile`, и
 * произвольный URL сюда попасть не должен.
 */
export const PORTAL_DOMAIN_PATTERN =
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Нормализация домена из тела запроса; null — не имя хоста. */
export function normalizePortalDomain(raw: string): string | null {
    const domain = raw.trim().toLowerCase();
    return PORTAL_DOMAIN_PATTERN.test(domain) ? domain : null;
}
