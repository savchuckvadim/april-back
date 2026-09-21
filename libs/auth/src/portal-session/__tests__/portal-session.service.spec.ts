import { JwtService } from '@nestjs/jwt';
import { AuthModuleOptions } from '../../config/auth.config';
import { AuthTokenService } from '../../services/auth-token.service';
import { Role } from '../../types/role.enum';
import {
    BitrixProfileClient,
    BitrixProfileResult,
} from '../bitrix-profile.client';
import { PortalSessionService } from '../portal-session.service';

const options: AuthModuleOptions = {
    enabled: true,
    jwt: { secret: 'test-secret', expiresIn: '1h' },
    superUser: { login: 'su', passwordHash: 'x' },
    publicPaths: [],
    portalSession: { guardMode: 'enforce' },
};

const makeService = (profile: BitrixProfileResult) => {
    const tokens = new AuthTokenService(new JwtService({}), options);
    const getProfile = jest.fn().mockResolvedValue(profile);
    const service = new PortalSessionService(
        { getProfile } as unknown as BitrixProfileClient,
        tokens,
    );
    return { service, tokens, getProfile };
};

describe('PortalSessionService', () => {
    it('живой AUTH_ID → JWT с доменом, Bitrix-id и ролью CLIENT; домен нормализован', async () => {
        const { service, tokens, getProfile } = makeService({
            ok: true,
            profile: { id: '447', name: 'Иван', lastName: null, isAdmin: true },
        });

        const result = await service.open({
            domain: '  April.Bitrix24.RU ',
            accessToken: 'auth-id',
            memberId: 'm1',
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(getProfile).toHaveBeenCalledWith('april.bitrix24.ru', 'auth-id');
        expect(result.session.domain).toBe('april.bitrix24.ru');
        expect(result.session.user).toEqual({
            id: '447',
            name: 'Иван',
            lastName: null,
            isAdmin: true,
        });
        const payload = tokens.verify(result.session.token);
        expect(payload.role).toBe(Role.CLIENT);
        expect(payload.domain).toBe('april.bitrix24.ru');
        expect(payload.bitrixUserId).toBe('447');
        expect(payload.isAdmin).toBe(true);
        expect(payload.sub).toBe('portal:april.bitrix24.ru:447');
        expect(result.session.expiresAt).not.toBeNull();
        expect(Date.parse(result.session.expiresAt ?? '')).toBeGreaterThan(
            Date.now(),
        );
    });

    it('домен не имя хоста (схема, путь, пробел, одна метка) → bad_domain без похода на портал', async () => {
        const { service, getProfile } = makeService({
            ok: true,
            profile: { id: '1', name: null, lastName: null, isAdmin: false },
        });

        for (const domain of [
            'https://april.bitrix24.ru',
            'april.bitrix24.ru/rest',
            'april bitrix24',
            'localhost',
            '',
        ]) {
            const result = await service.open({ domain, accessToken: 't' });
            expect(result).toMatchObject({ ok: false, reason: 'bad_domain' });
        }
        expect(getProfile).not.toHaveBeenCalled();
    });

    it('портал не подтвердил токен → rest_verify_failed с подсказкой переоткрыть приложение', async () => {
        const { service } = makeService({ ok: false, error: 'expired_token' });

        const result = await service.open({
            domain: 'april.bitrix24.ru',
            accessToken: 'stale',
        });

        expect(result).toMatchObject({
            ok: false,
            reason: 'rest_verify_failed',
        });
        if (result.ok) return;
        expect(result.message).toContain('переоткройте');
    });
});
