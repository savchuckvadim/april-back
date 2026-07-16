/**
 * Роли субъектов авторизации.
 *
 * {@link Role.SUPER_USER} — единственный администратор (учётные данные в `.env`).
 * {@link Role.CLIENT} — пользователь портала/клиент (portal-context сессия
 * маркетплейса, будущая клиентская авторизация apps/auth).
 * {@link Role.SERVICE} — машинный субъект (другой бэкенд монорепо, бот,
 * интеграция): долгоживущий Bearer-токен с `sub=<имя-сервиса>`, подписанный
 * общим AUTH_JWT_SECRET (выпуск — AuthTokenService.sign; храним в env
 * потребителя). Ручки, доступные и людям, и сервисам, помечаются
 * `@Roles(Role.CLIENT, Role.SERVICE)`.
 */
export enum Role {
    SUPER_USER = 'super_user',
    CLIENT = 'client',
    SERVICE = 'service',
}

/** Runtime-список значений {@link Role} — для Swagger `enum` и `@IsIn`. */
export const ROLE_VALUES = [
    Role.SUPER_USER,
    Role.CLIENT,
    Role.SERVICE,
] as const satisfies readonly Role[];
