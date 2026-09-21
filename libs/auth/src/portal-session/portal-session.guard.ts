import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Inject,
    Injectable,
    Logger,
    UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AUTH_OPTIONS } from '../config/auth.constants';
import { AuthModuleOptions } from '../config/auth.config';
import { AuthTokenService } from '../services/auth-token.service';
import { AuthJwtPayload, AuthUser } from '../types/auth-user.interface';
import { Role } from '../types/role.enum';
import { PortalSessionRejectReason } from './portal-session.const';

/** Запрос с portal-context сессией: guard кладёт payload в `user`. */
export interface PortalSessionRequest extends Request {
    user?: AuthUser;
}

interface PortalSessionRejection {
    reason: PortalSessionRejectReason;
    message: string;
    detail?: string;
}

/**
 * Guard мутирующих ручек, принимающих `domain` и `requesterUserId` в теле:
 * запрос обязан нести portal-context Bearer (выдан PortalSessionService
 * или сессией маркетплейса), а тело — совпадать с сессией: домен с
 * доменом токена, requesterUserId — с Bitrix-id токена. Так подменить
 * тело от имени руководителя нельзя (вопрос владельцу A3, вариант 1).
 *
 * Режим — `AuthModuleOptions.portalSession.guardMode`
 * (`PORTAL_SESSION_GUARD_MODE`): off / report / enforce, см.
 * portal-session.const. Проверка не зависит от AUTH_ENABLED: как и
 * PortalSessionGuard маркетплейса, при выключенной общей авторизации
 * сессионные ручки открытыми быть не должны.
 */
@Injectable()
export class PortalSessionGuard implements CanActivate {
    private readonly logger = new Logger(PortalSessionGuard.name);

    constructor(
        private readonly tokens: AuthTokenService,
        @Inject(AUTH_OPTIONS) private readonly options: AuthModuleOptions,
    ) {}

    canActivate(context: ExecutionContext): boolean {
        const mode = this.options.portalSession.guardMode;
        if (mode === 'off') return true;

        const request = context
            .switchToHttp()
            .getRequest<PortalSessionRequest>();
        const rejection = this.inspect(request);
        if (!rejection) return true;

        if (mode === 'report') {
            this.logger.warn(
                `portal-session (report): ${rejection.reason} — ` +
                    `${request.method} ${request.originalUrl ?? request.url}` +
                    (rejection.detail ? ` (${rejection.detail})` : ''),
            );
            return true;
        }
        throw rejection.reason === 'missing_token' ||
            rejection.reason === 'invalid_token'
            ? new UnauthorizedException(rejection.message)
            : new ForbiddenException(rejection.message);
    }

    /** null — запрос прошёл (user положен в request); иначе причина отказа. */
    private inspect(
        request: PortalSessionRequest,
    ): PortalSessionRejection | null {
        const [type, token] = request.headers.authorization?.split(' ') ?? [];
        if (type !== 'Bearer' || !token) {
            return {
                reason: 'missing_token',
                message:
                    'Нужен portal-context токен (Bearer) — получите его через POST auth/portal-session',
            };
        }
        let user: AuthJwtPayload;
        try {
            user = this.tokens.verify(token);
        } catch {
            return {
                reason: 'invalid_token',
                message:
                    'Невалидный или просроченный portal-context токен — переоткройте приложение из Битрикс24',
            };
        }
        if (user.role !== Role.CLIENT) {
            return {
                reason: 'wrong_role',
                message:
                    'Ручка доступна только portal-context сессии (role=CLIENT)',
            };
        }
        const body = bodyOf(request);
        const domain = stringField(body, 'domain');
        if (
            domain !== null &&
            (user.domain === undefined ||
                domain.toLowerCase() !== user.domain.toLowerCase())
        ) {
            return {
                reason: 'domain_mismatch',
                message: 'Домен запроса не совпадает с доменом сессии',
                detail: `${domain} ≠ ${user.domain ?? 'в токене нет домена'}`,
            };
        }
        const requester = stringField(body, 'requesterUserId');
        if (
            requester !== null &&
            (user.bitrixUserId === undefined || requester !== user.bitrixUserId)
        ) {
            return {
                reason: 'requester_mismatch',
                message:
                    'requesterUserId запроса не совпадает с пользователем сессии',
                detail: `${requester} ≠ ${user.bitrixUserId ?? 'в токене нет пользователя'}`,
            };
        }
        request.user = user;
        return null;
    }
}

function bodyOf(request: Request): Record<string, unknown> {
    const body: unknown = request.body;
    return body && typeof body === 'object'
        ? (body as Record<string, unknown>)
        : {};
}

/** Строковое поле тела (число приводится к строке); null — поля нет. */
function stringField(
    body: Record<string, unknown>,
    key: string,
): string | null {
    const value = body[key];
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    return null;
}
