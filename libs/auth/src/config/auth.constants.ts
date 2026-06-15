/**
 * Injection-токен с конфигурацией auth-библиотеки (см. {@link AuthModuleOptions}).
 * Передаётся из {@link AuthModule.forRoot} во все сервисы и гарды.
 */
export const AUTH_OPTIONS = Symbol('AUTH_OPTIONS');

/**
 * Ключ метаданных для декоратора `@Public()` — помечает эндпоинт как открытый
 * (гард пропускает запрос без проверки токена).
 */
export const IS_PUBLIC_KEY = 'auth:isPublic';

/**
 * Ключ метаданных для декоратора `@Roles(...)` — список ролей, которым разрешён
 * доступ к эндпоинту.
 */
export const ROLES_KEY = 'auth:roles';
