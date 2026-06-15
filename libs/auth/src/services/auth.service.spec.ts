import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hashSync } from 'bcrypt';
import { AuthService } from './auth.service';
import { AuthTokenService } from './auth-token.service';
import { AuthModuleOptions } from '../config/auth.config';
import { Role } from '../types/role.enum';

const PASSWORD = 'S3cretP@ss';

const buildOptions = (
    over: Partial<AuthModuleOptions> = {},
): AuthModuleOptions => ({
    enabled: true,
    jwt: { secret: 'test-secret', expiresIn: '1h' },
    superUser: { login: 'superuser', passwordHash: hashSync(PASSWORD, 10) },
    publicPaths: [],
    ...over,
});

const makeService = (options: AuthModuleOptions): AuthService =>
    new AuthService(new AuthTokenService(new JwtService({}), options), options);

describe('AuthService.login', () => {
    it('выдаёт токен при верных учётных данных', async () => {
        const service = makeService(buildOptions());

        const res = await service.login({
            login: 'superuser',
            password: PASSWORD,
        });

        expect(res.accessToken).toEqual(expect.any(String));
        expect(res.user.role).toBe(Role.SUPER_USER);
        expect(res.user.login).toBe('superuser');
    });

    it('отвергает неверный пароль', async () => {
        const service = makeService(buildOptions());

        await expect(
            service.login({ login: 'superuser', password: 'wrong' }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('отвергает неверный логин', async () => {
        const service = makeService(buildOptions());

        await expect(
            service.login({ login: 'intruder', password: PASSWORD }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('отвергает вход, если SuperUser не сконфигурирован', async () => {
        const service = makeService(
            buildOptions({ superUser: { login: '', passwordHash: '' } }),
        );

        await expect(
            service.login({ login: 'superuser', password: PASSWORD }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
    });
});

describe('AuthService.getMe', () => {
    it('возвращает переданного субъекта', () => {
        const service = makeService(buildOptions());
        const user = {
            sub: 'superuser',
            login: 'superuser',
            role: Role.SUPER_USER,
        };

        expect(service.getMe(user)).toEqual(user);
    });
});
