import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthTokenService, AuthUser, Role } from '@lib/auth';

/**
 * Guard portal-context сессии (онбординг/кабинет из iframe Битрикса).
 *
 * ОТЛИЧИЕ от JwtAuthGuard из @lib/auth: проверка БЕЗУСЛОВНАЯ — флаг
 * AUTH_ENABLED здесь не действует (pbx — публичное приложение без
 * глобальных гардов; при AUTH_ENABLED=false библиотечный guard пропустил
 * бы всех как SYSTEM_SUPER_USER, что для сессионных ручек недопустимо).
 *
 * Принимает ТОЛЬКО Bearer (решение задачи онбординга: без cookies —
 * нет SameSite/CHIPS-проблем в iframe) и ТОЛЬКО role=CLIENT
 * (portal-context JWT, выпущенный MarketplaceSessionService).
 * Payload кладётся в request.user → доступен через @CurrentUser().
 */
@Injectable()
export class PortalSessionGuard implements CanActivate {
    constructor(private readonly tokenService: AuthTokenService) {}

    canActivate(context: ExecutionContext): boolean {
        const request = context
            .switchToHttp()
            .getRequest<Request & { user?: AuthUser }>();

        const [type, token] = request.headers.authorization?.split(' ') ?? [];
        if (type !== 'Bearer' || !token) {
            throw new UnauthorizedException(
                'Нужен portal-context токен (Bearer) — получите его обменом кода сессии',
            );
        }

        let user: AuthUser;
        try {
            user = this.tokenService.verify(token);
        } catch {
            throw new UnauthorizedException(
                'Невалидный или просроченный portal-context токен — переоткройте приложение из Битрикс24',
            );
        }

        if (user.role !== Role.CLIENT) {
            throw new ForbiddenException(
                'Эндпоинт доступен только portal-context сессии (role=CLIENT)',
            );
        }

        request.user = user;
        return true;
    }
}
