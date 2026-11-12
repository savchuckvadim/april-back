import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { Client, Portal } from 'generated/prisma';
import { CabinetContext } from '../../domain/cabinet-context';
import { PasswordHasher } from '../../infrastructure/password-hasher';
import {
    CabinetMembershipRepository,
    MembershipWithUser,
} from '../../persistence/cabinet-membership.repository';
import { CabinetPortalRepository } from '../../persistence/cabinet-portal.repository';
import { CabinetTelegramBindingRepository } from '../../persistence/cabinet-telegram-binding.repository';
import { CabinetAdminService } from '../cabinet-admin.service';
import { CabinetAppStatusService } from '../cabinet-app-status.service';
import { CabinetOrganizationService } from '../cabinet-organization.service';

const ctx = (clientId: bigint | null = null): CabinetContext =>
    ({
        portal: {
            id: 12n,
            domain: 'alfacentr.bitrix24.ru',
            memberId: 'mid',
            clientId,
            approvalStatus: null,
        },
    }) as unknown as CabinetContext;

const portal = (id: bigint, domain: string): Portal =>
    ({ id, domain, approval_status: null, client_id: 6n }) as Portal;

const member = (
    portalId: bigint,
    userId: bigint,
    role: string,
    overrides: Partial<MembershipWithUser> = {},
): MembershipWithUser =>
    ({
        id: `m-${portalId}-${userId}`,
        portalId,
        userId,
        role,
        revokedAt: null,
        user: {
            id: userId,
            name: 'Пётр',
            surname: 'Иванов',
            email: `u${userId}@alfacentr.ru`,
            password: userId === 1n ? 'hash' : null,
        },
        ...overrides,
    }) as unknown as MembershipWithUser;

function setup() {
    const portals = {
        findClient: jest.fn().mockResolvedValue({
            id: 6n,
            name: 'Альфа-Центр',
            email: null,
            status: 'active',
            is_active: true,
        } as Client),
        findClientByEmail: jest.fn().mockResolvedValue(null),
        createClient: jest.fn().mockResolvedValue({ id: 7n } as Client),
        listByClient: jest
            .fn()
            .mockResolvedValue([
                portal(12n, 'alfacentr.bitrix24.ru'),
                portal(13n, 'alfa-2.bitrix24.ru'),
            ]),
    };
    const memberships = {
        listByPortal: jest.fn((portalId: bigint) =>
            Promise.resolve(
                portalId === 12n
                    ? [
                          member(12n, 1n, 'owner'),
                          member(12n, 2n, 'member'),
                          member(12n, 3n, 'pending'),
                          member(12n, 4n, 'member', { revokedAt: new Date() }),
                      ]
                    : [member(13n, 1n, 'member')],
            ),
        ),
    };
    const bindings = {
        listActiveByPortal: jest.fn((portalId: bigint) =>
            Promise.resolve(portalId === 12n ? [{}, {}] : []),
        ),
    };
    const hasher = {
        isUsable: (stored: string | null | undefined) => Boolean(stored),
    };
    const appStatus = {
        status: jest
            .fn()
            .mockResolvedValue({ installed: true, bitrixAuthMode: 'webhook' }),
    };
    const admin = {
        attachClient: jest.fn().mockResolvedValue({ portalId: 12 }),
    };
    const service = new CabinetOrganizationService(
        portals as unknown as CabinetPortalRepository,
        memberships as unknown as CabinetMembershipRepository,
        bindings as unknown as CabinetTelegramBindingRepository,
        hasher as unknown as PasswordHasher,
        appStatus as unknown as CabinetAppStatusService,
        admin as unknown as CabinetAdminService,
    );
    return { service, portals, admin };
}

describe('CabinetOrganizationService.createForPortal', () => {
    it('заводит организацию и сразу привязывает портал', async () => {
        const { service, portals, admin } = setup();
        await service.createForPortal(ctx(), {
            name: '  Альфа-Центр ',
            email: ' Director@AlfaCentr.ru ',
        });
        expect(portals.createClient).toHaveBeenCalledWith({
            name: 'Альфа-Центр',
            email: 'director@alfacentr.ru',
        });
        expect(admin.attachClient).toHaveBeenCalledWith(ctx(), 7);
    });

    it('без email — организация без email', async () => {
        const { service, portals } = setup();
        await service.createForPortal(ctx(), { name: 'Альфа', email: '' });
        expect(portals.findClientByEmail).not.toHaveBeenCalled();
        expect(portals.createClient).toHaveBeenCalledWith({
            name: 'Альфа',
            email: null,
        });
    });

    it('портал уже с организацией — отказ', async () => {
        const { service, portals } = setup();
        await expect(
            service.createForPortal(ctx(6n), { name: 'Альфа', email: null }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(portals.createClient).not.toHaveBeenCalled();
    });

    it('email занят — 409 с названием организации', async () => {
        const { service, portals } = setup();
        portals.findClientByEmail.mockResolvedValue({
            id: 3n,
            name: 'Гарант',
        } as Client);
        await expect(
            service.createForPortal(ctx(), { name: 'Альфа', email: 'x@y.ru' }),
        ).rejects.toThrow(ConflictException);
        await expect(
            service.createForPortal(ctx(), { name: 'Альфа', email: 'x@y.ru' }),
        ).rejects.toThrow('«Гарант» (#3)');
    });
});

describe('CabinetOrganizationService.overview', () => {
    it('порталы: владелец, участники без заявок и снятых, заявки, Telegram', async () => {
        const { service } = setup();
        const overview = await service.overview(6);
        expect(overview).toMatchObject({
            clientId: 6,
            name: 'Альфа-Центр',
            isActive: true,
        });
        expect(overview.portals[0]).toEqual({
            portalId: 12,
            domain: 'alfacentr.bitrix24.ru',
            approvalStatus: null,
            appInstalled: true,
            bitrixAuthMode: 'webhook',
            owner: {
                name: 'Иванов Пётр',
                email: 'u1@alfacentr.ru',
                hasPassword: true,
            },
            members: 2,
            pending: 1,
            telegram: 2,
        });
        expect(overview.portals[1]).toMatchObject({
            owner: null,
            members: 1,
            telegram: 0,
        });
    });

    it('люди: одна учётка в двух порталах — одной строкой с ролями', async () => {
        const { service } = setup();
        const { people } = await service.overview(6);
        expect(people.map(person => person.userId)).toEqual([1, 2]);
        expect(people[0]).toEqual({
            userId: 1,
            name: 'Иванов Пётр',
            email: 'u1@alfacentr.ru',
            hasPassword: true,
            portals: [
                {
                    portalId: 12,
                    domain: 'alfacentr.bitrix24.ru',
                    role: 'owner',
                },
                { portalId: 13, domain: 'alfa-2.bitrix24.ru', role: 'member' },
            ],
        });
        expect(people[1]?.hasPassword).toBe(false);
    });

    it('нет организации — 404', async () => {
        const { service, portals } = setup();
        portals.findClient.mockResolvedValue(null);
        await expect(service.overview(99)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
});
