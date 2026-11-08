import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { PortalUser, User } from 'generated/prisma';
import { CabinetMembershipService } from '../cabinet-membership.service';
import { CabinetAccountProvisioner } from '../cabinet-account-provisioner';
import {
    CabinetMembershipRepository,
    MembershipWithUser,
} from '../../persistence/cabinet-membership.repository';
import { CabinetUserRepository } from '../../persistence/cabinet-user.repository';
import { PasswordHasher } from '../../infrastructure/password-hasher';
import { CabinetVendorNotifier } from '../../infrastructure/cabinet-vendor-notifier';
import { CabinetContext } from '../../domain/cabinet-context';
import { CabinetAccessLevel } from '../../domain/cabinet.constants';

const USER = {
    id: BigInt(17),
    email: 'anna@company.ru',
    name: 'Анна',
    surname: 'Смирнова',
    client_id: BigInt(5),
    password: '!unusable!x',
} as User;

const row = (patch: Partial<PortalUser> = {}): MembershipWithUser =>
    ({
        id: 'm-1',
        portalId: BigInt(12),
        userId: BigInt(17),
        role: 'member',
        bitrixUserId: null,
        revokedAt: null,
        createdAt: new Date('2026-11-08T09:00:00Z'),
        user: USER,
        ...patch,
    }) as MembershipWithUser;

const ctxOf = (
    level: CabinetAccessLevel,
    clientId: bigint | null = BigInt(5),
): CabinetContext => ({
    subject:
        level === 'platform'
            ? { kind: 'platform', login: 'admin' }
            : { kind: 'account', userId: BigInt(1), login: 'owner@company.ru' },
    portal: {
        id: BigInt(12),
        domain: 'a.bitrix24.ru',
        memberId: 'member-1',
        clientId,
        approvalStatus: null,
    },
    level,
    membership: null,
});

describe('CabinetMembershipService (участники и владелец)', () => {
    let repo: jest.Mocked<
        Pick<
            CabinetMembershipRepository,
            | 'listByPortal'
            | 'findById'
            | 'upsert'
            | 'countOwners'
            | 'transferOwnership'
            | 'setRole'
            | 'revoke'
        >
    >;
    let users: jest.Mocked<
        Pick<CabinetUserRepository, 'findByEmail' | 'create' | 'setClient'>
    >;
    let notifier: jest.Mocked<Pick<CabinetVendorNotifier, 'notify'>>;
    let service: CabinetMembershipService;

    beforeEach(() => {
        repo = {
            listByPortal: jest.fn().mockResolvedValue([row()]),
            findById: jest.fn().mockResolvedValue(row()),
            upsert: jest.fn().mockResolvedValue({ id: 'm-1' }),
            countOwners: jest.fn().mockResolvedValue(1),
            transferOwnership: jest.fn().mockResolvedValue({ id: 'm-1' }),
            setRole: jest.fn().mockResolvedValue({ id: 'm-1' }),
            revoke: jest.fn().mockResolvedValue({ id: 'm-1' }),
        };
        users = {
            findByEmail: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue(USER),
            setClient: jest.fn().mockResolvedValue(USER),
        };
        notifier = { notify: jest.fn().mockResolvedValue(undefined) };
        service = new CabinetMembershipService(
            repo as unknown as CabinetMembershipRepository,
            new CabinetAccountProvisioner(
                users as unknown as CabinetUserRepository,
            ),
            new PasswordHasher(),
            notifier as unknown as CabinetVendorNotifier,
        );
    });

    const INPUT = {
        email: 'anna@company.ru',
        firstName: 'Анна',
        lastName: 'Смирнова',
    };

    it('новая учётка заводится в организации портала, участник — member', async () => {
        const result = await service.add(ctxOf('owner'), INPUT);

        expect(users.create).toHaveBeenCalledWith(
            expect.objectContaining({
                email: 'anna@company.ru',
                clientId: BigInt(5),
            }),
        );
        expect(repo.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ role: 'member', invitedBy: 'user:1' }),
        );
        expect(repo.transferOwnership).not.toHaveBeenCalled();
        expect(result.isNewUser).toBe(true);
    });

    it('первый участник портала становится владельцем сам', async () => {
        repo.countOwners.mockResolvedValue(0);
        await service.add(ctxOf('platform'), INPUT);
        expect(repo.transferOwnership).toHaveBeenCalledWith(BigInt(12), 'm-1');
    });

    it('назначить владельца при добавлении — только April', async () => {
        await expect(
            service.add(ctxOf('owner'), { ...INPUT, makeOwner: true }),
        ).rejects.toBeInstanceOf(ForbiddenException);

        await service.add(ctxOf('platform'), { ...INPUT, makeOwner: true });
        expect(repo.transferOwnership).toHaveBeenCalled();
    });

    it('email учётки другой организации — 409, доступ не выдаётся', async () => {
        users.findByEmail.mockResolvedValue({ ...USER, client_id: BigInt(99) });
        await expect(service.add(ctxOf('owner'), INPUT)).rejects.toBeInstanceOf(
            ConflictException,
        );
        expect(repo.upsert).not.toHaveBeenCalled();
    });

    it('учётка без организации получает организацию портала', async () => {
        users.findByEmail.mockResolvedValue({ ...USER, client_id: null });
        await service.add(ctxOf('owner'), INPUT);
        expect(users.setClient).toHaveBeenCalledWith(BigInt(17), BigInt(5));
    });

    it('портал без организации-клиента — 400 с подсказкой', async () => {
        await expect(
            service.add(ctxOf('platform', null), INPUT),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('подтверждение заявки: участник при живом владельце, владелец — если его нет', async () => {
        repo.findById.mockResolvedValue(row({ role: 'pending' }));
        await service.approve(ctxOf('owner'), 'm-1');
        expect(repo.setRole).toHaveBeenCalledWith('m-1', 'member');

        repo.countOwners.mockResolvedValue(0);
        await service.approve(ctxOf('platform'), 'm-1');
        expect(repo.transferOwnership).toHaveBeenCalledWith(BigInt(12), 'm-1');
    });

    it('подтвердить можно только заявку', async () => {
        await expect(
            service.approve(ctxOf('owner'), 'm-1'),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('участник чужого портала не находится', async () => {
        repo.findById.mockResolvedValue(row({ portalId: BigInt(99) }));
        await expect(
            service.revoke(ctxOf('owner'), 'm-1'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('передача прав: одной транзакцией + уведомление вендору', async () => {
        await service.makeOwner(ctxOf('owner'), 'm-1');
        expect(repo.transferOwnership).toHaveBeenCalledWith(BigInt(12), 'm-1');
        expect(notifier.notify).toHaveBeenCalled();
    });

    it('владелец не передаёт права заявке и снятому участнику', async () => {
        repo.findById.mockResolvedValueOnce(row({ role: 'pending' }));
        await expect(
            service.makeOwner(ctxOf('owner'), 'm-1'),
        ).rejects.toBeInstanceOf(BadRequestException);
        repo.findById.mockResolvedValueOnce(row({ revokedAt: new Date() }));
        await expect(
            service.makeOwner(ctxOf('owner'), 'm-1'),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('владельца снимает только April', async () => {
        repo.findById.mockResolvedValue(row({ role: 'owner' }));
        await expect(
            service.revoke(ctxOf('owner'), 'm-1'),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await service.revoke(ctxOf('platform'), 'm-1');
        expect(repo.revoke).toHaveBeenCalledWith('m-1');
    });

    it('список отдаёт признак «пароль задан» без самого пароля', async () => {
        const [member] = await service.list(ctxOf('owner'));
        expect(member.hasPassword).toBe(false);
        expect(JSON.stringify(member)).not.toContain('unusable');
    });
});
