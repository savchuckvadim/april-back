import {
    BadRequestException,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthTokenService, AuthUser } from '@lib/auth';
import {
    CabinetAccessLevel,
    hasCabinetLevel,
} from '../domain/cabinet.constants';
import { CabinetRequest } from '../domain/cabinet-context';
import { CabinetAccessService } from './cabinet-access.service';
import {
    CABINET_ACCESS_KEY,
    CABINET_PORTAL_PARAM,
} from './cabinet-access.constants';

/**
 * Гард ручек кабинета клиента. Проверка БЕЗУСЛОВНАЯ (флаг AUTH_ENABLED
 * не действует — как у portal-context гардов pbx): токен только Bearer
 * (во фрейме Битрикса cookies не работают), подпись — общий секрет.
 *
 * Портал запроса — параметр маршрута `:portalId`; его нет — ручка без
 * портала. Уровень доступа требует декоратор `@CabinetAccess(level)`.
 * Контекст кладётся в `request.cabinet` (декоратор `@CabinetCtx()`).
 */
@Injectable()
export class CabinetAccessGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly tokens: AuthTokenService,
        private readonly access: CabinetAccessService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const required =
            this.reflector.getAllAndOverride<CabinetAccessLevel>(
                CABINET_ACCESS_KEY,
                [context.getHandler(), context.getClass()],
            ) ?? 'member';
        const request = context.switchToHttp().getRequest<CabinetRequest>();

        const user = this.verify(request);
        const portalId = parsePortalParam(
            request.params?.[CABINET_PORTAL_PARAM],
        );
        const cabinet = await this.access.resolve(user, portalId);

        if (!hasCabinetLevel(cabinet.level, required)) {
            throw new ForbiddenException(
                required === 'owner'
                    ? 'Действие доступно только владельцу кабинета портала'
                    : 'Недостаточно прав в кабинете портала',
            );
        }
        request.user = user;
        request.cabinet = cabinet;
        return true;
    }

    private verify(request: CabinetRequest): AuthUser {
        const [type, token] = request.headers.authorization?.split(' ') ?? [];
        if (type !== 'Bearer' || !token) {
            throw new UnauthorizedException(
                'Нужен токен кабинета (Bearer) — войдите или откройте приложение из Битрикс24',
            );
        }
        try {
            return this.tokens.verify(token);
        } catch {
            throw new UnauthorizedException(
                'Сессия кабинета истекла — войдите заново',
            );
        }
    }
}

/** `:portalId` маршрута → bigint; нет параметра — undefined. */
export function parsePortalParam(raw: unknown): bigint | undefined {
    if (raw === undefined || raw === null || raw === '') return undefined;
    const text =
        typeof raw === 'string' || typeof raw === 'number'
            ? String(raw).trim()
            : '';
    if (!/^\d+$/.test(text) || text === '0') {
        throw new BadRequestException('Неверный номер портала');
    }
    return BigInt(text);
}
