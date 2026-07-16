import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { TelegramService } from '@lib/telegram';
import { MarketplaceOnboardingService } from '../services/marketplace-onboarding.service';
import { MarketplaceInstallRepository } from '../persistence/marketplace-install.repository';
import { PortalSessionState } from '../services/marketplace-session.service';

type RepoMock = jest.Mocked<
    Pick<
        MarketplaceInstallRepository,
        'findInstallWithClient' | 'linkClient' | 'logEvent'
    >
>;
type TelegramMock = jest.Mocked<Pick<TelegramService, 'sendMessage'>>;

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

describe('MarketplaceOnboardingService (заявка на подключение)', () => {
    let service: MarketplaceOnboardingService;
    let repo: RepoMock;
    let telegram: TelegramMock;

    const dto = {
        organizationName: 'ООО «Ромашка»',
        contactEmail: 'director@romashka.ru',
    };

    beforeEach(() => {
        repo = {
            findInstallWithClient: jest
                .fn()
                .mockResolvedValue(installWith('pending', null)),
            linkClient: jest.fn().mockResolvedValue({
                id: BigInt(5),
                name: dto.organizationName,
                email: dto.contactEmail,
            }),
            logEvent: jest.fn().mockResolvedValue(undefined),
        };
        telegram = { sendMessage: jest.fn().mockResolvedValue(undefined) };

        service = new MarketplaceOnboardingService(
            repo as unknown as MarketplaceInstallRepository,
            telegram as unknown as TelegramService,
        );
    });

    it('подача заявки: создаёт клиента, журналирует, уведомляет вендора', async () => {
        // после linkClient состояние пересчитывается повторным чтением
        repo.findInstallWithClient
            .mockResolvedValueOnce(installWith('pending', null) as never)
            .mockResolvedValueOnce(
                installWith('pending', BigInt(5), {
                    name: dto.organizationName,
                    email: dto.contactEmail,
                }) as never,
            );

        const result = await service.submitApplication('member-1', dto);

        expect(repo.linkClient).toHaveBeenCalledWith(BigInt(7), {
            organizationName: dto.organizationName,
            contactEmail: dto.contactEmail,
        });
        expect(repo.logEvent).toHaveBeenCalledWith(
            expect.objectContaining({ event: 'ONBOARDING_APPLICATION' }),
        );
        expect(telegram.sendMessage).toHaveBeenCalledWith(
            expect.stringContaining('ООО «Ромашка»'),
        );
        expect(result.state).toBe(PortalSessionState.PENDING);
        expect(result.organization?.name).toBe(dto.organizationName);
    });

    it('blocked-портал → ForbiddenException, клиент не создаётся', async () => {
        repo.findInstallWithClient.mockResolvedValue(
            installWith('blocked', BigInt(5)) as never,
        );
        await expect(
            service.submitApplication('member-1', dto),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(repo.linkClient).not.toHaveBeenCalled();
    });

    it('установка не найдена → NotFoundException', async () => {
        repo.findInstallWithClient.mockResolvedValue(null);
        await expect(
            service.submitApplication('member-1', dto),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('дубль email (unique-индекс clients.email) → понятная BadRequest', async () => {
        repo.linkClient.mockRejectedValue(
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
            .mockResolvedValueOnce(
                installWith('pending', BigInt(5), {
                    name: dto.organizationName,
                    email: dto.contactEmail,
                }) as never,
            );

        const result = await service.submitApplication('member-1', dto);
        expect(result.state).toBe(PortalSessionState.PENDING);
    });

    it('getState: возвращает состояние и поданную заявку', async () => {
        repo.findInstallWithClient.mockResolvedValue(
            installWith('pending', BigInt(5), {
                name: 'ООО «Ромашка»',
                email: 'director@romashka.ru',
            }) as never,
        );
        const state = await service.getState('member-1');
        expect(state.state).toBe(PortalSessionState.PENDING);
        expect(state.organization).toEqual({
            name: 'ООО «Ромашка»',
            email: 'director@romashka.ru',
        });
    });
});
