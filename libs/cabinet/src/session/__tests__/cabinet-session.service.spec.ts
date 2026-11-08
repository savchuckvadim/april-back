import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcrypt';
import { User } from 'generated/prisma';
import { AuthTokenService, Role } from '@lib/auth';
import { CabinetSessionService } from '../cabinet-session.service';
import { CabinetConfig } from '../../config/cabinet.config';
import { CabinetTokenRepository } from '../../persistence/cabinet-token.repository';
import { CabinetUserRepository } from '../../persistence/cabinet-user.repository';
import {
    CabinetMembershipRepository,
    MembershipWithPortal,
} from '../../persistence/cabinet-membership.repository';
import { CabinetThrottle } from '../../infrastructure/cabinet-throttle';
import { PasswordHasher } from '../../infrastructure/password-hasher';

const tokens = new AuthTokenService(new JwtService({}), {
    enabled: true,
    jwt: { secret: 'test-secret', expiresIn: '12h' },
    superUser: { login: '', passwordHash: '' },
    publicPaths: [],
    portalSession: { guardMode: 'report' },
});

const ACTIVE = [
    { portal: { approval_status: null } },
] as unknown as MembershipWithPortal[];

describe('CabinetSessionService (вход с сайта)', () => {
    let user: User;
    let users: jest.Mocked<
        Pick<CabinetUserRepository, 'findByEmail' | 'findById'>
    >;
    let memberships: jest.Mocked<
        Pick<CabinetMembershipRepository, 'listActiveByUser'>
    >;
    let refresh: jest.Mocked<Pick<CabinetTokenRepository, 'save' | 'consume'>>;
    let throttle: jest.Mocked<Pick<CabinetThrottle, 'hit' | 'reset'>>;
    let service: CabinetSessionService;

    beforeAll(async () => {
        user = {
            id: BigInt(17),
            email: 'anna@company.ru',
            client_id: BigInt(5),
            // Laravel-хэш ($2y$) тоже должен приниматься
            password: (await hash('Пароль2026', 4)).replace(/^\$2b\$/, '$2y$'),
        } as User;
    });

    beforeEach(() => {
        users = {
            findByEmail: jest.fn().mockResolvedValue(user),
            findById: jest.fn().mockResolvedValue(user),
        };
        memberships = { listActiveByUser: jest.fn().mockResolvedValue(ACTIVE) };
        refresh = {
            save: jest.fn().mockResolvedValue(undefined),
            consume: jest.fn().mockResolvedValue(BigInt(17)),
        };
        throttle = {
            hit: jest.fn().mockResolvedValue(undefined),
            reset: jest.fn().mockResolvedValue(undefined),
        };
        const config = {
            accessTtl: () => '15m',
            refreshTtlDays: () => 30,
        } as unknown as CabinetConfig;
        service = new CabinetSessionService(
            config,
            tokens,
            refresh as unknown as CabinetTokenRepository,
            users as unknown as CabinetUserRepository,
            memberships as unknown as CabinetMembershipRepository,
            new PasswordHasher(),
            throttle as unknown as CabinetThrottle,
        );
    });

    it('верный пароль: короткий access с учёткой, refresh сохранён хэшем', async () => {
        const session = await service.login('anna@company.ru', 'Пароль2026');

        const payload = tokens.verify(session.accessToken);
        expect(payload).toMatchObject({
            sub: 'user:17',
            role: Role.CLIENT,
            userId: 17,
            clientId: 5,
        });
        // 15 минут, а не 12 часов библиотеки
        expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(15 * 60);
        expect(refresh.save).toHaveBeenCalledWith(
            BigInt(17),
            'cabinet_refresh',
            session.refreshToken,
            expect.any(Date),
        );
        expect(throttle.reset).toHaveBeenCalled();
    });

    it('неверный пароль и неизвестный email — одинаковый ответ', async () => {
        await expect(service.login('anna@company.ru', 'нет')).rejects.toThrow(
            'Неверный email или пароль',
        );
        users.findByEmail.mockResolvedValue(null);
        await expect(service.login('x@y.ru', 'Пароль2026')).rejects.toThrow(
            'Неверный email или пароль',
        );
    });

    it('учётка без пароля (заглушка заявки) не входит', async () => {
        users.findByEmail.mockResolvedValue({
            ...user,
            password: '!unusable!abc',
        });
        await expect(
            service.login('anna@company.ru', '!unusable!abc'),
        ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('нет доступа ни к одному открытому порталу — 403', async () => {
        memberships.listActiveByUser.mockResolvedValue([
            { portal: { approval_status: 'blocked' } },
        ] as unknown as MembershipWithPortal[]);
        await expect(
            service.login('anna@company.ru', 'Пароль2026'),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refresh: старый гасится, выдаётся новая пара', async () => {
        const session = await service.refresh('old-refresh');
        expect(refresh.consume).toHaveBeenCalledWith(
            'old-refresh',
            'cabinet_refresh',
        );
        expect(session.refreshToken).not.toBe('old-refresh');
    });

    it('refresh погашенного/чужого токена — 401', async () => {
        refresh.consume.mockResolvedValue(null);
        await expect(service.refresh('x')).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
    });
});
