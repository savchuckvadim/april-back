import {
    ExecutionContext,
    ForbiddenException,
    UnauthorizedException,
} from '@nestjs/common';
import { AuthModuleOptions } from '../../config/auth.config';
import { AuthTokenService } from '../../services/auth-token.service';
import { AuthJwtPayload } from '../../types/auth-user.interface';
import { Role } from '../../types/role.enum';
import { PortalSessionGuardMode } from '../portal-session.const';
import {
    PortalSessionGuard,
    PortalSessionRequest,
} from '../portal-session.guard';

const CLIENT: AuthJwtPayload = {
    sub: 'portal:april.bitrix24.ru:447',
    login: '447@april.bitrix24.ru',
    role: Role.CLIENT,
    domain: 'april.bitrix24.ru',
    bitrixUserId: '447',
    isAdmin: false,
};

const buildOptions = (
    guardMode: PortalSessionGuardMode,
): AuthModuleOptions => ({
    enabled: true,
    jwt: { secret: 's', expiresIn: '1h' },
    superUser: { login: 'su', passwordHash: 'x' },
    publicPaths: [],
    portalSession: { guardMode },
});

interface RequestInit {
    authorization?: string;
    body?: Record<string, unknown>;
}

const makeContext = (
    init: RequestInit,
): { ctx: ExecutionContext; request: PortalSessionRequest } => {
    const request = {
        headers: init.authorization
            ? { authorization: init.authorization }
            : {},
        body: init.body ?? {},
        method: 'POST',
        originalUrl: '/api/ai-analytics/settings/save',
    } as unknown as PortalSessionRequest;
    const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { ctx, request };
};

const makeGuard = (
    mode: PortalSessionGuardMode,
    verifyImpl: () => AuthJwtPayload = () => CLIENT,
) => {
    const verify = jest.fn(verifyImpl);
    const guard = new PortalSessionGuard(
        { verify } as unknown as AuthTokenService,
        buildOptions(mode),
    );
    return { guard, verify };
};

const OWN_BODY = { domain: 'April.Bitrix24.ru', requesterUserId: '447' };

describe('PortalSessionGuard', () => {
    it('off — пропускает всё, токен даже не проверяется', () => {
        const { guard, verify } = makeGuard('off');
        const { ctx } = makeContext({ body: OWN_BODY });

        expect(guard.canActivate(ctx)).toBe(true);
        expect(verify).not.toHaveBeenCalled();
    });

    describe('enforce', () => {
        it('нет Bearer → 401', () => {
            const { guard } = makeGuard('enforce');
            const { ctx } = makeContext({ body: OWN_BODY });

            expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
        });

        it('невалидный токен → 401', () => {
            const { guard } = makeGuard('enforce', () => {
                throw new Error('jwt expired');
            });
            const { ctx } = makeContext({
                authorization: 'Bearer stale',
                body: OWN_BODY,
            });

            expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
        });

        it('токен не portal-context (role SUPER_USER) → 403', () => {
            const { guard } = makeGuard('enforce', () => ({
                sub: 'su',
                login: 'su',
                role: Role.SUPER_USER,
            }));
            const { ctx } = makeContext({
                authorization: 'Bearer su',
                body: OWN_BODY,
            });

            expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
        });

        it('домен тела не совпадает с доменом сессии → 403', () => {
            const { guard } = makeGuard('enforce');
            const { ctx } = makeContext({
                authorization: 'Bearer t',
                body: { ...OWN_BODY, domain: 'other.bitrix24.ru' },
            });

            expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
        });

        it('в токене нет домена, а в теле есть → 403 (сессия не привязана к порталу)', () => {
            const { guard } = makeGuard('enforce', () => ({
                ...CLIENT,
                domain: undefined,
            }));
            const { ctx } = makeContext({
                authorization: 'Bearer t',
                body: OWN_BODY,
            });

            expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
        });

        it('requesterUserId тела не совпадает с пользователем сессии → 403', () => {
            const { guard } = makeGuard('enforce');
            const { ctx } = makeContext({
                authorization: 'Bearer t',
                body: { ...OWN_BODY, requesterUserId: '99' },
            });

            expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
        });

        it('свой домен (без учёта регистра) и свой id (даже числом) → пропуск, user в request', () => {
            const { guard } = makeGuard('enforce');
            const { ctx, request } = makeContext({
                authorization: 'Bearer t',
                body: { domain: 'APRIL.bitrix24.ru', requesterUserId: 447 },
            });

            expect(guard.canActivate(ctx)).toBe(true);
            expect(request.user?.bitrixUserId).toBe('447');
        });

        it('тело без domain/requesterUserId → достаточно валидной сессии', () => {
            const { guard } = makeGuard('enforce');
            const { ctx } = makeContext({
                authorization: 'Bearer t',
                body: { kind: 'digest' },
            });

            expect(guard.canActivate(ctx)).toBe(true);
        });
    });

    describe('report', () => {
        it('нет токена → пропускает (нарушение только в лог)', () => {
            const { guard } = makeGuard('report');
            const { ctx } = makeContext({ body: OWN_BODY });

            expect(guard.canActivate(ctx)).toBe(true);
        });

        it('чужой пользователь → пропускает, user в request не кладёт', () => {
            const { guard } = makeGuard('report');
            const { ctx, request } = makeContext({
                authorization: 'Bearer t',
                body: { ...OWN_BODY, requesterUserId: '99' },
            });

            expect(guard.canActivate(ctx)).toBe(true);
            expect(request.user).toBeUndefined();
        });

        it('свой токен → user в request, как в enforce', () => {
            const { guard } = makeGuard('report');
            const { ctx, request } = makeContext({
                authorization: 'Bearer t',
                body: OWN_BODY,
            });

            expect(guard.canActivate(ctx)).toBe(true);
            expect(request.user?.domain).toBe('april.bitrix24.ru');
        });
    });
});
