import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { AuthModuleOptions } from '../config/auth.config';
import { Role } from '../types/role.enum';
import { AuthUser } from '../types/auth-user.interface';
import { AuthenticatedRequest } from '../types/auth-request.interface';

const buildOptions = (
    over: Partial<AuthModuleOptions> = {},
): AuthModuleOptions => ({
    enabled: true,
    jwt: { secret: 's', expiresIn: '1h' },
    superUser: { login: 'su', passwordHash: 'x' },
    publicPaths: [],
    ...over,
});

const makeContext = (user?: AuthUser): ExecutionContext => {
    const request = { user } as AuthenticatedRequest;
    return {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => 'handler',
        getClass: () => 'class',
    } as unknown as ExecutionContext;
};

const makeGuard = (
    options: AuthModuleOptions,
    requiredRoles: Role[] | undefined,
): RolesGuard => {
    const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
    } as unknown as Reflector;
    return new RolesGuard(reflector, options);
};

const SUPER_USER: AuthUser = {
    sub: 'su',
    login: 'su',
    role: Role.SUPER_USER,
};

describe('RolesGuard', () => {
    it('пропускает при AUTH_ENABLED=false', () => {
        const guard = makeGuard(buildOptions({ enabled: false }), [
            Role.SUPER_USER,
        ]);

        expect(guard.canActivate(makeContext())).toBe(true);
    });

    it('пропускает, если роли не заданы', () => {
        const guard = makeGuard(buildOptions(), undefined);

        expect(guard.canActivate(makeContext(SUPER_USER))).toBe(true);
    });

    it('пропускает субъекта с нужной ролью', () => {
        const guard = makeGuard(buildOptions(), [Role.SUPER_USER]);

        expect(guard.canActivate(makeContext(SUPER_USER))).toBe(true);
    });

    it('отказывает субъекту без нужной роли', () => {
        const guard = makeGuard(buildOptions(), [Role.SUPER_USER]);
        const client: AuthUser = {
            sub: '1',
            login: 'client',
            role: Role.CLIENT,
        };

        expect(() => guard.canActivate(makeContext(client))).toThrow(
            ForbiddenException,
        );
    });

    it('отказывает при отсутствии субъекта', () => {
        const guard = makeGuard(buildOptions(), [Role.SUPER_USER]);

        expect(() => guard.canActivate(makeContext())).toThrow(
            ForbiddenException,
        );
    });
});
