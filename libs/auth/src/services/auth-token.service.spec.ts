import { JwtService } from '@nestjs/jwt';
import { AuthTokenService } from './auth-token.service';
import { AuthModuleOptions } from '../config/auth.config';
import { Role } from '../types/role.enum';

const options: AuthModuleOptions = {
    enabled: true,
    jwt: { secret: 'test-secret', expiresIn: '1h' },
    superUser: { login: 'su', passwordHash: 'x' },
    publicPaths: [],
    portalSession: { guardMode: 'report' },
};

describe('AuthTokenService', () => {
    const service = new AuthTokenService(new JwtService({}), options);

    it('sign/verify — корректный round-trip', () => {
        const token = service.sign({
            sub: 'su',
            login: 'su',
            role: Role.SUPER_USER,
        });
        const payload = service.verify(token);

        expect(payload.sub).toBe('su');
        expect(payload.login).toBe('su');
        expect(payload.role).toBe(Role.SUPER_USER);
    });

    it('сохраняет clientId/portalId, если заданы', () => {
        const token = service.sign({
            sub: '1',
            login: 'client',
            role: Role.CLIENT,
            clientId: 5,
            portalId: 42,
        });
        const payload = service.verify(token);

        expect(payload.clientId).toBe(5);
        expect(payload.portalId).toBe(42);
    });

    it('сохраняет memberId/userId/domain кабинета, если заданы', () => {
        const payload = service.verify(
            service.sign({
                sub: 'user:17',
                login: 'a@b.ru',
                role: Role.CLIENT,
                userId: 17,
                memberId: 'member-1',
                domain: 'a.bitrix24.ru',
            }),
        );

        expect(payload.userId).toBe(17);
        expect(payload.memberId).toBe('member-1');
        expect(payload.domain).toBe('a.bitrix24.ru');
    });

    it('срок токена задаётся на вызов, иначе — из конфигурации', () => {
        const short = service.verify(
            service.sign(
                { sub: 'user:1', login: 'x', role: Role.CLIENT },
                { expiresIn: '15m' },
            ),
        );
        expect((short.exp ?? 0) - (short.iat ?? 0)).toBe(15 * 60);

        const normal = service.verify(
            service.sign({ sub: 'su', login: 'su', role: Role.SUPER_USER }),
        );
        expect((normal.exp ?? 0) - (normal.iat ?? 0)).toBe(60 * 60);
    });

    it('отвергает токен, подписанный другим секретом', () => {
        const other = new AuthTokenService(new JwtService({}), {
            ...options,
            jwt: { secret: 'another-secret', expiresIn: '1h' },
        });
        const token = other.sign({
            sub: 'su',
            login: 'su',
            role: Role.SUPER_USER,
        });

        expect(() => service.verify(token)).toThrow();
    });

    it('отвергает мусорный токен', () => {
        expect(() => service.verify('not-a-jwt')).toThrow();
    });
});
