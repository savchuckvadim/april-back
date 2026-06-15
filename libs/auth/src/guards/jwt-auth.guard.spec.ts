import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthTokenService } from '../services/auth-token.service';
import { AuthModuleOptions } from '../config/auth.config';
import { Role } from '../types/role.enum';
import { AuthenticatedRequest } from '../types/auth-request.interface';

const buildOptions = (
    over: Partial<AuthModuleOptions> = {},
): AuthModuleOptions => ({
    enabled: true,
    jwt: { secret: 's', expiresIn: '1h' },
    superUser: { login: 'su', passwordHash: 'x' },
    publicPaths: ['/api/health'],
    ...over,
});

interface RequestInit {
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
    path?: string;
}

const makeContext = (
    init: RequestInit,
): { ctx: ExecutionContext; request: AuthenticatedRequest } => {
    const request = {
        headers: init.headers ?? {},
        cookies: init.cookies ?? {},
        path: init.path ?? '/api/resource',
    } as unknown as AuthenticatedRequest;

    const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => 'handler',
        getClass: () => 'class',
    } as unknown as ExecutionContext;

    return { ctx, request };
};

const makeGuard = (
    options: AuthModuleOptions,
    reflectorValue: boolean,
    verifyImpl?: () => unknown,
): JwtAuthGuard => {
    const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue(reflectorValue),
    } as unknown as Reflector;
    const tokenService = {
        verify: jest.fn(verifyImpl),
    } as unknown as AuthTokenService;
    return new JwtAuthGuard(reflector, tokenService, options);
};

describe('JwtAuthGuard', () => {
    it('пропускает @Public()-эндпоинт без токена', () => {
        const guard = makeGuard(buildOptions(), true);
        const { ctx } = makeContext({});

        expect(guard.canActivate(ctx)).toBe(true);
    });

    it('при AUTH_ENABLED=false пропускает и подставляет системного субъекта', () => {
        const guard = makeGuard(buildOptions({ enabled: false }), false);
        const { ctx, request } = makeContext({});

        expect(guard.canActivate(ctx)).toBe(true);
        expect(request.user?.role).toBe(Role.SUPER_USER);
        expect(request.user?.login).toBe('system');
    });

    it('пропускает publicPaths (health) даже при включённой auth', () => {
        const guard = makeGuard(buildOptions(), false);
        const { ctx } = makeContext({ path: '/api/health' });

        expect(guard.canActivate(ctx)).toBe(true);
    });

    it('бросает 401 при отсутствии токена', () => {
        const guard = makeGuard(buildOptions(), false);
        const { ctx } = makeContext({});

        expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('пропускает валидный Bearer и кладёт субъекта в request', () => {
        const user = { sub: 'su', login: 'su', role: Role.SUPER_USER };
        const guard = makeGuard(buildOptions(), false, () => user);
        const { ctx, request } = makeContext({
            headers: { authorization: 'Bearer good-token' },
        });

        expect(guard.canActivate(ctx)).toBe(true);
        expect(request.user).toEqual(user);
    });

    it('бросает 401 при невалидном токене', () => {
        const guard = makeGuard(buildOptions(), false, () => {
            throw new Error('invalid');
        });
        const { ctx } = makeContext({
            headers: { authorization: 'Bearer bad-token' },
        });

        expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });
});
