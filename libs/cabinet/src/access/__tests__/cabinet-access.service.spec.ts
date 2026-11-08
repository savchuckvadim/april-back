import {
    ForbiddenException,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { Portal, PortalUser, User } from 'generated/prisma';
import { Role } from '@lib/auth';
import { CabinetAccessService } from '../cabinet-access.service';
import { CabinetPortalRepository } from '../../persistence/cabinet-portal.repository';
import { CabinetMembershipRepository } from '../../persistence/cabinet-membership.repository';
import { CabinetUserRepository } from '../../persistence/cabinet-user.repository';

const PORTAL = {
    id: BigInt(12),
    domain: 'a.bitrix24.ru',
    member_id: 'member-1',
    client_id: BigInt(5),
    approval_status: null,
} as Portal;

const membership = (patch: Partial<PortalUser> = {}): PortalUser =>
    ({
        id: 'm-1',
        portalId: BigInt(12),
        userId: BigInt(17),
        role: 'member',
        bitrixUserId: '7',
        revokedAt: null,
        ...patch,
    }) as PortalUser;

const ACCOUNT = {
    sub: 'user:17',
    login: 'a@b.ru',
    role: Role.CLIENT,
    userId: 17,
};
const FRAME = {
    sub: 'member-1',
    login: 'bx',
    role: Role.CLIENT,
    portalId: 12,
    bitrixUserId: '7',
};

describe('CabinetAccessService.resolve (кто и с каким уровнем)', () => {
    let portals: jest.Mocked<
        Pick<CabinetPortalRepository, 'findById' | 'findByLookup'>
    >;
    let memberships: jest.Mocked<
        Pick<
            CabinetMembershipRepository,
            'findByPortalUser' | 'findActiveByBitrix'
        >
    >;
    let users: jest.Mocked<Pick<CabinetUserRepository, 'findById'>>;
    let service: CabinetAccessService;

    beforeEach(() => {
        portals = {
            findById: jest.fn().mockResolvedValue(PORTAL),
            findByLookup: jest.fn().mockResolvedValue(PORTAL),
        };
        memberships = {
            findByPortalUser: jest.fn().mockResolvedValue(membership()),
            findActiveByBitrix: jest.fn().mockResolvedValue(null),
        };
        users = {
            findById: jest.fn().mockResolvedValue({ id: BigInt(17) } as User),
        };
        service = new CabinetAccessService(
            portals as unknown as CabinetPortalRepository,
            memberships as unknown as CabinetMembershipRepository,
            users as unknown as CabinetUserRepository,
        );
    });

    it('администратор April — любой портал, уровень platform', async () => {
        const ctx = await service.resolve(
            { sub: 'admin', login: 'admin', role: Role.SUPER_USER },
            BigInt(12),
        );
        expect(ctx.level).toBe('platform');
        expect(ctx.portal?.id).toBe(BigInt(12));
    });

    it('учётка с действующим членством — уровень роли', async () => {
        memberships.findByPortalUser.mockResolvedValue(
            membership({ role: 'owner' }),
        );
        const ctx = await service.resolve(ACCOUNT, BigInt(12));
        expect(ctx.level).toBe('owner');
        expect(ctx.membership?.id).toBe('m-1');
    });

    it('учётка без членства, с заявкой или снятым доступом — 403', async () => {
        memberships.findByPortalUser.mockResolvedValueOnce(null);
        await expect(
            service.resolve(ACCOUNT, BigInt(12)),
        ).rejects.toBeInstanceOf(ForbiddenException);
        memberships.findByPortalUser.mockResolvedValueOnce(
            membership({ role: 'pending' }),
        );
        await expect(
            service.resolve(ACCOUNT, BigInt(12)),
        ).rejects.toBeInstanceOf(ForbiddenException);
        memberships.findByPortalUser.mockResolvedValueOnce(
            membership({ revokedAt: new Date() }),
        );
        await expect(
            service.resolve(ACCOUNT, BigInt(12)),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('удалённая учётка — 401', async () => {
        users.findById.mockResolvedValue(null);
        await expect(service.resolve(ACCOUNT)).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
    });

    it('портал, отключённый вендором, закрыт клиенту', async () => {
        memberships.findByPortalUser.mockResolvedValue(
            membership({ role: 'owner' }),
        );
        portals.findById.mockResolvedValue({
            ...PORTAL,
            approval_status: 'blocked',
        });
        await expect(
            service.resolve(ACCOUNT, BigInt(12)),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('фрейм без членства — уровень frame на портале сессии', async () => {
        const ctx = await service.resolve(FRAME);
        expect(ctx.level).toBe('frame');
        expect(ctx.portal?.id).toBe(BigInt(12));
        expect(memberships.findActiveByBitrix).toHaveBeenCalledWith(
            BigInt(12),
            '7',
        );
    });

    it('фрейм с членством владельца — уровень owner', async () => {
        memberships.findActiveByBitrix.mockResolvedValue(
            membership({ role: 'owner' }),
        );
        const ctx = await service.resolve(FRAME, BigInt(12));
        expect(ctx.level).toBe('owner');
    });

    it('фрейм с заявкой — всё ещё frame', async () => {
        memberships.findActiveByBitrix.mockResolvedValue(
            membership({ role: 'pending' }),
        );
        const ctx = await service.resolve(FRAME);
        expect(ctx.level).toBe('frame');
        expect(ctx.membership?.role).toBe('pending');
    });

    it('фрейм не может открыть чужой портал', async () => {
        await expect(service.resolve(FRAME, BigInt(99))).rejects.toBeInstanceOf(
            ForbiddenException,
        );
    });

    it('портал сессии не найден — 404', async () => {
        portals.findByLookup.mockResolvedValue(null);
        await expect(service.resolve(FRAME)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it('чужой токен (SERVICE) — 401', async () => {
        await expect(
            service.resolve({ sub: 'bot', login: 'bot', role: Role.SERVICE }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
    });
});
