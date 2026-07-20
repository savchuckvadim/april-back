import {
    BadRequestException,
    ForbiddenException,
    HttpException,
    NotFoundException,
} from '@nestjs/common';
import { TelegramService } from '@lib/telegram';
import { RedisService } from '@/core/redis/redis.service';
import { MarketplaceOnboardingService } from '../services/marketplace-onboarding.service';
import { MarketplaceInstallRepository } from '../persistence/marketplace-install.repository';
import { MarketplaceClientRepository } from '../persistence/marketplace-client.repository';
import { PortalSessionState } from '../services/marketplace-session.service';

type RepoMock = jest.Mocked<
    Pick<MarketplaceInstallRepository, 'findInstallWithClient' | 'logEvent'>
>;
type ClientRepoMock = jest.Mocked<
    Pick<MarketplaceClientRepository, 'linkClientWithRootUser'>
>;
type TelegramMock = jest.Mocked<Pick<TelegramService, 'sendMessage'>>;

const CONTACT_EMAIL = 'director@romashka.ru';

const installWith = (
    approvalStatus: string | null,
    clientId: bigint | null,
    clients: { name: string; email: string | null } | null = null,
) => ({
    id: 'install-uuid',
    uninstalled_at: null,
    portals: {
        id: BigInt(7),
        domain: 'april-dev.bitrix24.ru',
        approval_status: approvalStatus,
        client_id: clientId,
        clients,
    },
});

const linkedInstall = () =>
    installWith('pending', BigInt(5), {
        name: 'ООО «Ромашка»',
        email: CONTACT_EMAIL,
    });

describe('MarketplaceOnboardingService (заявка на подключение)', () => {
    let service: MarketplaceOnboardingService;
    let repo: RepoMock;
    let clientRepo: ClientRepoMock;
    let telegram: TelegramMock;
    let redisClient: { incr: jest.Mock; expire: jest.Mock };

    const dto = {
        organizationName: 'ООО «Ромашка»',
        lastName: 'Иванов',
        firstName: 'Пётр',
        contactEmail: CONTACT_EMAIL,
    };

    beforeEach(() => {
        repo = {
            findInstallWithClient: jest
                .fn()
                .mockResolvedValue(installWith('pending', null)),
            logEvent: jest.fn().mockResolvedValue(undefined),
        };
        clientRepo = {
            linkClientWithRootUser: jest.fn().mockResolvedValue({
                id: BigInt(5),
                name: dto.organizationName,
                email: dto.contactEmail,
            }),
        };
        telegram = { sendMessage: jest.fn().mockResolvedValue(undefined) };
        redisClient = {
            incr: jest.fn().mockResolvedValue(1),
            expire: jest.fn().mockResolvedValue(1),
        };

        service = new MarketplaceOnboardingService(
            repo as unknown as MarketplaceInstallRepository,
            clientRepo as unknown as MarketplaceClientRepository,
            { getClient: () => redisClient } as unknown as RedisService,
            telegram as unknown as TelegramService,
        );
    });

    it('подача заявки: создаёт организацию с корневым пользователем, журналирует, уведомляет вендора', async () => {
        // после привязки состояние пересчитывается повторным чтением
        repo.findInstallWithClient
            .mockResolvedValueOnce(installWith('pending', null) as never)
            .mockResolvedValueOnce(linkedInstall() as never);

        const result = await service.submitApplication(
            'member-1',
            dto,
            'bx-42',
        );

        expect(clientRepo.linkClientWithRootUser).toHaveBeenCalledWith(
            BigInt(7),
            {
                organizationName: dto.organizationName,
                contactEmail: dto.contactEmail,
                lastName: 'Иванов',
                firstName: 'Пётр',
                bitrixUserId: 'bx-42',
            },
        );
        expect(repo.logEvent).toHaveBeenCalledWith(
            expect.objectContaining({ event: 'ONBOARDING_APPLICATION' }),
        );
        expect(telegram.sendMessage).toHaveBeenCalledWith(
            expect.stringContaining('Иванов Пётр'),
        );
        expect(result.state).toBe(PortalSessionState.PENDING);
        expect(result.organization?.name).toBe(dto.organizationName);
    });

    it('blocked-портал → ForbiddenException, организация не создаётся', async () => {
        repo.findInstallWithClient.mockResolvedValue(
            installWith('blocked', BigInt(5)) as never,
        );
        await expect(
            service.submitApplication('member-1', dto),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(clientRepo.linkClientWithRootUser).not.toHaveBeenCalled();
    });

    it('установка не найдена → NotFoundException', async () => {
        repo.findInstallWithClient.mockResolvedValue(null);
        await expect(
            service.submitApplication('member-1', dto),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('дубль email (unique clients.email / users.email) → понятная BadRequest', async () => {
        clientRepo.linkClientWithRootUser.mockRejectedValue(
            new Error('Unique constraint failed on clients_email_unique'),
        );
        await expect(
            service.submitApplication('member-1', dto),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('сбой Telegram НЕ роняет заявку (best-effort)', async () => {
        telegram.sendMessage.mockRejectedValue(new Error('tg down'));
        repo.findInstallWithClient
            .mockResolvedValueOnce(installWith('pending', null) as never)
            .mockResolvedValueOnce(linkedInstall() as never);

        const result = await service.submitApplication('member-1', dto);
        expect(result.state).toBe(PortalSessionState.PENDING);
    });

    it('getState: контактный email отдаётся МАСКИРОВАННЫМ', async () => {
        repo.findInstallWithClient.mockResolvedValue(linkedInstall() as never);

        const state = await service.getState('member-1');

        expect(state.state).toBe(PortalSessionState.PENDING);
        expect(state.organization).toEqual({
            name: 'ООО «Ромашка»',
            emailMasked: 'd***r@romashka.ru',
        });
        // полный адрес наружу не уходит
        expect(JSON.stringify(state)).not.toContain(CONTACT_EMAIL);
    });

    describe('requestCode (запрос кода подключения)', () => {
        beforeEach(() => {
            repo.findInstallWithClient.mockResolvedValue(
                linkedInstall() as never,
            );
        });

        it('без адреса: код запрашивается на контактный email организации', async () => {
            const result = await service.requestCode('member-1', {}, {});

            expect(result.accepted).toBe(true);
            expect(result.deliveryEmailMasked).toBe('d***r@romashka.ru');
            expect(repo.logEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'INVITE_CODE_REQUESTED',
                    status: 'processed',
                }),
            );
        });

        it('администратор портала может запросить доставку на другой адрес', async () => {
            const result = await service.requestCode(
                'member-1',
                { deliveryEmail: 'new@romashka.ru' },
                { isAdmin: true, bitrixUserId: 'bx-1' },
            );

            expect(result.deliveryEmailMasked).toBe('n***w@romashka.ru');
            expect(telegram.sendMessage).toHaveBeenCalledWith(
                expect.stringContaining('НА ДРУГОЙ АДРЕС'),
            );
        });

        it('НЕ администратор не может увести код на свой адрес → Forbidden', async () => {
            await expect(
                service.requestCode(
                    'member-1',
                    { deliveryEmail: 'employee@romashka.ru' },
                    { isAdmin: false },
                ),
            ).rejects.toBeInstanceOf(ForbiddenException);
            expect(repo.logEvent).not.toHaveBeenCalled();
        });

        it('тот же адрес в другом регистре не считается «другим» → права не нужны', async () => {
            const result = await service.requestCode(
                'member-1',
                { deliveryEmail: 'DIRECTOR@Romashka.ru' },
                { isAdmin: false },
            );
            expect(result.accepted).toBe(true);
        });

        it('контактный email организации при доставке на другой адрес НЕ переписывается', async () => {
            await service.requestCode(
                'member-1',
                { deliveryEmail: 'new@romashka.ru' },
                { isAdmin: true },
            );
            expect(clientRepo.linkClientWithRootUser).not.toHaveBeenCalled();
        });

        it('4-й запрос в окне → 429', async () => {
            redisClient.incr.mockResolvedValue(4);
            await expect(
                service.requestCode('member-1', {}, {}),
            ).rejects.toThrow(HttpException);
        });

        it('Redis недоступен → запрос не блокируется', async () => {
            redisClient.incr.mockRejectedValue(new Error('redis down'));
            const result = await service.requestCode('member-1', {}, {});
            expect(result.accepted).toBe(true);
        });

        it('заявки ещё не было (нет организации) → BadRequest', async () => {
            repo.findInstallWithClient.mockResolvedValue(
                installWith('pending', null) as never,
            );
            await expect(
                service.requestCode('member-1', {}, {}),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('blocked-портал → Forbidden', async () => {
            repo.findInstallWithClient.mockResolvedValue(
                installWith('blocked', BigInt(5), {
                    name: 'ООО «Ромашка»',
                    email: CONTACT_EMAIL,
                }) as never,
            );
            await expect(
                service.requestCode('member-1', {}, {}),
            ).rejects.toBeInstanceOf(ForbiddenException);
        });
    });
});
