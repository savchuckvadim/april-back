import { BadRequestException } from '@nestjs/common';
import { User } from 'generated/prisma';
import {
    assertPasswordShape,
    CabinetPasswordService,
} from '../cabinet-password.service';
import { CabinetConfig } from '../../config/cabinet.config';
import { CabinetTokenRepository } from '../../persistence/cabinet-token.repository';
import { CabinetUserRepository } from '../../persistence/cabinet-user.repository';
import {
    CabinetMembershipRepository,
    MembershipWithPortal,
} from '../../persistence/cabinet-membership.repository';
import { CabinetMailer } from '../../infrastructure/cabinet-mailer.port';
import { CabinetThrottle } from '../../infrastructure/cabinet-throttle';
import { PasswordHasher } from '../../infrastructure/password-hasher';

const USER = {
    id: BigInt(17),
    email: 'anna@company.ru',
    name: 'Анна',
    password: '!unusable!x',
} as User;

describe('CabinetPasswordService (ссылки и пароль)', () => {
    let tokens: jest.Mocked<
        Pick<
            CabinetTokenRepository,
            'save' | 'revokeAll' | 'findUserId' | 'consume'
        >
    >;
    let users: jest.Mocked<
        Pick<
            CabinetUserRepository,
            'findByEmail' | 'findById' | 'setPasswordHash'
        >
    >;
    let memberships: jest.Mocked<
        Pick<CabinetMembershipRepository, 'listActiveByUser'>
    >;
    let sendPasswordLink: jest.Mock;
    let mailer: CabinetMailer;
    let service: CabinetPasswordService;

    beforeEach(() => {
        tokens = {
            save: jest.fn().mockResolvedValue(undefined),
            revokeAll: jest.fn().mockResolvedValue(undefined),
            findUserId: jest.fn().mockResolvedValue(null),
            consume: jest.fn().mockResolvedValue(null),
        };
        users = {
            findByEmail: jest.fn().mockResolvedValue(USER),
            findById: jest.fn().mockResolvedValue(USER),
            setPasswordHash: jest.fn().mockResolvedValue(USER),
        };
        memberships = {
            listActiveByUser: jest
                .fn()
                .mockResolvedValue([{}] as MembershipWithPortal[]),
        };
        sendPasswordLink = jest.fn().mockResolvedValue(false);
        mailer = { sendPasswordLink };
        const config = {
            siteUrl: () => 'https://bitrix.april-app.ru',
        } as unknown as CabinetConfig;
        service = new CabinetPasswordService(
            config,
            tokens as unknown as CabinetTokenRepository,
            users as unknown as CabinetUserRepository,
            memberships as unknown as CabinetMembershipRepository,
            mailer,
            { hit: jest.fn(), reset: jest.fn() } as unknown as CabinetThrottle,
            new PasswordHasher(),
        );
    });

    it('ссылка установки: прежние гаснут, ссылка на сайт кабинета, без почты — emailSent=false', async () => {
        const link = await service.issueLink(USER, 'setup');

        expect(tokens.revokeAll).toHaveBeenCalledWith(
            BigInt(17),
            'cabinet_password_setup',
        );
        expect(link.url).toMatch(
            /^https:\/\/bitrix\.april-app\.ru\/auth\/set-password\/[0-9a-f]{96}$/,
        );
        expect(link.emailSent).toBe(false);
        // ссылка на установку живёт 7 дней
        const days = (link.expiresAt.getTime() - Date.now()) / 86_400_000;
        expect(days).toBeGreaterThan(6.9);
        expect(sendPasswordLink).toHaveBeenCalledWith(
            expect.objectContaining({
                to: 'anna@company.ru',
                purpose: 'setup',
            }),
        );
    });

    it('«забыли пароль» без доступа к порталам — письма нет, ответ тот же', async () => {
        memberships.listActiveByUser.mockResolvedValue([]);
        await expect(
            service.requestReset('anna@company.ru'),
        ).resolves.toBeUndefined();
        expect(tokens.save).not.toHaveBeenCalled();

        users.findByEmail.mockResolvedValue(null);
        await expect(
            service.requestReset('nobody@x.ru'),
        ).resolves.toBeUndefined();
        expect(tokens.save).not.toHaveBeenCalled();
    });

    it('«забыли пароль» с доступом — ссылка восстановления', async () => {
        await service.requestReset('anna@company.ru');
        expect(tokens.save).toHaveBeenCalledWith(
            BigInt(17),
            'cabinet_password_reset',
            expect.any(String),
            expect.any(Date),
        );
    });

    it('пароль по ссылке: bcrypt, все сессии и ссылки гаснут', async () => {
        tokens.consume.mockResolvedValueOnce(BigInt(17));
        await service.setPassword('token', 'Пароль2026');

        const hash = users.setPasswordHash.mock.calls[0][1];
        expect(hash).toMatch(/^\$2b\$12\$/);
        expect(tokens.revokeAll).toHaveBeenCalledWith(
            BigInt(17),
            'cabinet_refresh',
        );
        expect(tokens.revokeAll).toHaveBeenCalledWith(
            BigInt(17),
            'cabinet_password_reset',
        );
    });

    it('погашенная ссылка — 400', async () => {
        await expect(
            service.setPassword('used', 'Пароль2026'),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('проверка ссылки: назначение и маска email', async () => {
        tokens.findUserId
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(BigInt(17));
        await expect(service.inspect('t')).resolves.toEqual({
            valid: true,
            purpose: 'reset',
            emailMasked: 'a***@company.ru',
        });
    });

    it('слабый пароль отклоняется', () => {
        expect(() => assertPasswordShape('короткий')).toThrow(
            BadRequestException,
        );
        expect(() => assertPasswordShape('безцифрвообще')).toThrow(
            BadRequestException,
        );
        expect(() => assertPasswordShape('12345678')).toThrow(
            BadRequestException,
        );
        expect(() => assertPasswordShape('Пароль2026')).not.toThrow();
    });
});
