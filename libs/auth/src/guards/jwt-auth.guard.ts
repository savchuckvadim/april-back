import {
    CanActivate,
    ExecutionContext,
    Inject,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_OPTIONS, IS_PUBLIC_KEY } from '../config/auth.constants';
import { AuthModuleOptions } from '../config/auth.config';
import { AuthTokenService } from '../services/auth-token.service';
import { Role } from '../types/role.enum';
import { AuthUser } from '../types/auth-user.interface';
import { AuthenticatedRequest } from '../types/auth-request.interface';

/**
 * Синтетический субъект, подставляемый при выключенной авторизации
 * (`AUTH_ENABLED=false`), чтобы потребители `@CurrentUser()` продолжали работать.
 */
const SYSTEM_SUPER_USER: AuthUser = {
    sub: 'system',
    login: 'system',
    role: Role.SUPER_USER,
};

/**
 * Глобальный гард аутентификации (ручной, на `@nestjs/jwt`).
 *
 * Логика:
 * 1. Эндпоинт помечен `@Public()` → пропустить.
 * 2. `AUTH_ENABLED=false` → подставить системного субъекта и пропустить
 *    (всё работает как раньше).
 * 3. Иначе — извлечь Bearer-токен (заголовок или cookie), проверить и положить
 *    {@link AuthUser} в `request.user`; при ошибке — 401.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly tokenService: AuthTokenService,
        @Inject(AUTH_OPTIONS) private readonly options: AuthModuleOptions,
    ) {}

    canActivate(context: ExecutionContext): boolean {
        const isPublic = this.reflector.getAllAndOverride<boolean>(
            IS_PUBLIC_KEY,
            [context.getHandler(), context.getClass()],
        );
        if (isPublic) return true;

        const request = context
            .switchToHttp()
            .getRequest<AuthenticatedRequest>();

        if (this.isPublicPath(request)) return true;

        if (!this.options.enabled) {
            request.user = SYSTEM_SUPER_USER;
            return true;
        }

        const token = this.extractToken(request);
        if (!token) {
            throw new UnauthorizedException('Токен не предоставлен');
        }

        try {
            request.user = this.tokenService.verify(token);
        } catch {
            throw new UnauthorizedException(
                'Невалидный или просроченный токен',
            );
        }

        return true;
    }

    private isPublicPath(request: AuthenticatedRequest): boolean {
        return this.options.publicPaths.some(path =>
            request.path.startsWith(path),
        );
    }

    private extractToken(request: AuthenticatedRequest): string | undefined {
        const [type, token] = request.headers.authorization?.split(' ') ?? [];
        if (type === 'Bearer' && token) return token;

        const cookieToken = (request.cookies as Record<string, string>)
            ?.access_token;
        return cookieToken || undefined;
    }
}
