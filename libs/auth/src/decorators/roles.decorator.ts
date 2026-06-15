import { SetMetadata } from '@nestjs/common';
import { ROLES_KEY } from '../config/auth.constants';
import { Role } from '../types/role.enum';

/**
 * Ограничивает доступ к эндпоинту перечисленными ролями. Проверяется
 * {@link RolesGuard} после успешной аутентификации.
 *
 * @example
 * ```ts
 * @Roles(Role.SUPER_USER)
 * @Get('secret')
 * secret() { ... }
 * ```
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
