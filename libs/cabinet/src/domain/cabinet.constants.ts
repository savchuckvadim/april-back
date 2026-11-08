/**
 * Константы кабинета клиента-портала (решения владельца 07.11.2026,
 * план: C:\Users\Vadim\.claude\plans\snug-pondering-lighthouse.md).
 *
 * Тотальная типизация: роли, уровни доступа, имена токенов и переменных
 * окружения — только отсюда, без строк по месту.
 */

/**
 * Роль учётной записи в портале (`portal_users.role`):
 * - `owner` — корневой пользователь организации: раздаёт доступы,
 *   передаёт права владельца;
 * - `member` — сотрудник с доступом в кабинет;
 * - `pending` — заявка из фрейма, ждёт подтверждения владельцем или
 *   платформой; прав не даёт.
 */
export const CABINET_ROLES = ['owner', 'member', 'pending'] as const;
export type CabinetRole = (typeof CABINET_ROLES)[number];

export function isCabinetRole(value: string): value is CabinetRole {
    return (CABINET_ROLES as readonly string[]).includes(value);
}

/**
 * Уровень доступа субъекта к порталу — по возрастанию прав:
 * - `frame` — сотрудник портала из фрейма без учётки (или с заявкой):
 *   видит статус своего портала, привязывает свой Telegram, просит доступ;
 * - `member` — участник кабинета;
 * - `owner` — владелец (управляет участниками);
 * - `platform` — администратор April (SUPER_USER): всё за любого клиента.
 */
export const CABINET_ACCESS_LEVELS = [
    'frame',
    'member',
    'owner',
    'platform',
] as const;
export type CabinetAccessLevel = (typeof CABINET_ACCESS_LEVELS)[number];

/** Хватает ли уровня `actual` для требования `required`. */
export function hasCabinetLevel(
    actual: CabinetAccessLevel,
    required: CabinetAccessLevel,
): boolean {
    return (
        CABINET_ACCESS_LEVELS.indexOf(actual) >=
        CABINET_ACCESS_LEVELS.indexOf(required)
    );
}

/** Префикс `sub` токена входа с сайта: `user:<users.id>`. */
export const CABINET_ACCOUNT_SUB_PREFIX = 'user:';

/**
 * Имена строк `personal_access_tokens` кабинета. Свои, а не легаси
 * (`refresh_token`/`password_reset` из apps/bitrix-app-client): таблица
 * общая, смешивать токены двух систем нельзя.
 */
export const CABINET_TOKEN_NAMES = {
    refresh: 'cabinet_refresh',
    passwordReset: 'cabinet_password_reset',
    passwordSetup: 'cabinet_password_setup',
} as const;

/** `tokenable_type` строк `personal_access_tokens` (как у Laravel). */
export const CABINET_TOKENABLE_TYPE = 'User';

/** Назначение ссылки установки пароля. */
export const CABINET_PASSWORD_LINK_PURPOSES = ['setup', 'reset'] as const;
export type CabinetPasswordLinkPurpose =
    (typeof CABINET_PASSWORD_LINK_PURPOSES)[number];

/** Откуда сделана привязка Telegram (`telegram_bindings.created_by`). */
export const CABINET_TELEGRAM_SOURCES = ['frame', 'site', 'admin'] as const;
export type CabinetTelegramSource = (typeof CABINET_TELEGRAM_SOURCES)[number];

/**
 * Переменные окружения кабинета — корневой `.env`, всё, что зависит от
 * сервера (прод, зеркало, локально). Все необязательны — есть умолчания.
 */
export const CABINET_ENV = {
    /** Срок access-токена входа с сайта (`15m`). */
    accessTtl: 'CABINET_ACCESS_TTL',
    /** Срок refresh-токена, дней (30). */
    refreshTtlDays: 'CABINET_REFRESH_TTL_DAYS',
    /** Адрес сайта кабинета для ссылок из писем (`https://bitrix.april-app.ru`). */
    siteUrl: 'CABINET_SITE_URL',
    /** Домен refresh-cookie (`.april-app.ru`); пусто — cookie без домена (локально). */
    cookieDomain: 'CABINET_COOKIE_DOMAIN',
    /** Публичный адрес вебхука клиентского бота (читает только apps/bot). */
    telegramWebhookUrl: 'CABINET_TELEGRAM_WEBHOOK_URL',
} as const;

/**
 * Настройка вендора клиентского Telegram-бота — админка «Настройки
 * приложения» → «Telegram-боты». Имя бота и секрет вебхука не
 * задаются: имя — у Telegram (getMe), секрет — из токена.
 */
export const CABINET_TELEGRAM_SETTING_KEYS = {
    botToken: 'CABINET_TELEGRAM_BOT_TOKEN',
} as const;

export const CABINET_DEFAULTS = {
    accessTtl: '15m',
    refreshTtlDays: 30,
    passwordResetTtlMinutes: 60,
    passwordSetupTtlDays: 7,
    siteUrl: 'https://bitrix.april-app.ru',
    /** Telegram-код привязки живёт 10 минут. */
    telegramCodeTtlSeconds: 600,
    refreshCookieName: 'april_cabinet_refresh',
    /** Путь cookie = префикс ручек входа (`/api` — глобальный префикс). */
    refreshCookiePath: '/api/cabinet/auth',
} as const;
