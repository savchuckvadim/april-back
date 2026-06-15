/**
 * Роли субъектов авторизации.
 *
 * На текущем этапе используется только {@link Role.SUPER_USER} (единственный
 * администратор, чьи учётные данные лежат в `.env`). {@link Role.CLIENT}
 * зарезервирована под будущую клиентскую авторизацию (пользователь, привязанный
 * к client + portal).
 */
export enum Role {
    SUPER_USER = 'super_user',
    CLIENT = 'client',
}

/** Runtime-список значений {@link Role} — для Swagger `enum` и `@IsIn`. */
export const ROLE_VALUES = [
    Role.SUPER_USER,
    Role.CLIENT,
] as const satisfies readonly Role[];
