import { JwtService } from '@nestjs/jwt';
import { AuthTokenService } from './auth-token.service';
import { AuthModuleOptions } from '../config/auth.config';
import { Role } from '../types/role.enum';

const options: AuthModuleOptions = {
    enabled: true,
    jwt: { secret: 'test-secret', expiresIn: '1h' },
    superUser: { login: 'su', passwordHash: 'x' },
    publicPaths: [],
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
