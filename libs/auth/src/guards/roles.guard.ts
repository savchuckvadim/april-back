import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Inject,
    Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_OPTIONS, ROLES_KEY } from '../config/auth.constants';
import { AuthModuleOptions } from '../config/auth.config';
import { Role } from '../types/role.enum';
import { AuthenticatedRequest } from '../types/auth-request.interface';

/**
 * Гард проверки ролей. Работает после {@link JwtAuthGuard} (тот кладёт
 * пользователя в `request.user`). Если `@Roles(...)` не задан — пропускает.
 * При выключенной авторизации (`AUTH_ENABLED=false`) — пропускает всегда.
 */
@Injectable()
export class RolesGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        @Inject(AUTH_OPTIONS) private readonly options: AuthModuleOptions,
    ) {}

    canActivate(context: ExecutionContext): boolean {
        if (!this.options.enabled) return true;

        const requiredRoles = this.reflector.getAllAndOverride<Role[]>(
            ROLES_KEY,
            [context.getHandler(), context.getClass()],
        );
        if (!requiredRoles || requiredRoles.length === 0) return true;

        const request = context
            .switchToHttp()
            .getRequest<AuthenticatedRequest>();
        const user = request.user;
        if (!user) {
            throw new ForbiddenException('Недостаточно прав доступа');
        }

        if (!requiredRoles.includes(user.role)) {
            throw new ForbiddenException('Недостаточно прав доступа');
        }

        return true;
    }
}
