import {
    BadGatewayException,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { AxiosError, AxiosHeaders, AxiosResponse } from 'axios';
import { TelegramService } from '@lib/telegram';
import { MarketplaceModerationService } from '../services/marketplace-moderation.service';
import {
    MarketplaceModerationRepository,
    ModerationPortal,
} from '../repositories/marketplace-moderation.repository';
import { ApprovalAction } from '../dto/marketplace-moderation.dto';

type RepoMock = jest.Mocked<
    Pick<
        MarketplaceModerationRepository,
        | 'findApplications'
        | 'findPortalById'
        | 'updateClientStatus'
        | 'setPortalBlocked'
        | 'detachPortal'
        | 'findComponentsByPortal'
        | 'logModerationEvent'
        | 'findInstalls'
        | 'findInstallById'
        | 'findEvents'
        | 'findPortalProducts'
    >
>;

const portalFixture = (
    over: Partial<ModerationPortal> = {},
): ModerationPortal =>
    ({
        id: BigInt(7),
        domain: 'april-dev.bitrix24.ru',
        member_id: 'member-1',
        source: 'marketplace',
        approval_status: 'pending',
        approved_at: null,
        approved_by: null,
        client_id: BigInt(5),
        clients: {
            id: BigInt(5),
            name: 'ООО «Ромашка»',
            email: 'director@romashka.ru',
            status: 'pending',
        },
        marketplace_installs: [
            {
                id: 'install-uuid',
                install_status: 'installed',
                uninstalled_at: null,
                expires_at: new Date('2026-07-18T06:54:08Z'),
                refresh_token: 'enc',
                updated_at: new Date('2026-07-18T06:00:00Z'),
            },
        ],
        ...over,
    }) as unknown as ModerationPortal;

const axiosOk = (data: unknown): AxiosResponse => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: new AxiosHeaders() },
});

describe('MarketplaceModerationService (approve/block заявок)', () => {
    let service: MarketplaceModerationService;
    let repo: RepoMock;
    let httpPost: jest.Mock;
    let telegram: jest.Mocked<Pick<TelegramService, 'sendMessage'>>;

    beforeEach(() => {
        repo = {
            findApplications: jest.fn().mockResolvedValue([portalFixture()]),
            findPortalById: jest.fn().mockResolvedValue(portalFixture()),
            updateClientStatus: jest.fn().mockResolvedValue(undefined),
            setPortalBlocked: jest.fn().mockResolvedValue(undefined),
            detachPortal: jest.fn().mockResolvedValue(undefined),
            findComponentsByPortal: jest.fn().mockResolvedValue([]),
            logModerationEvent: jest.fn().mockResolvedValue(undefined),
            findInstalls: jest.fn().mockResolvedValue([
                {
                    id: 'install-uuid',
                    portal_id: BigInt(7),
                    app_code: 'garant_manager',
                    domain: 'april-dev.bitrix24.ru',
                    install_status: 'installed',
                    error_step: null,
                    error_detail: null,
                    version: '1',
                    installed_at: new Date('2026-07-18T06:00:19Z'),
                    uninstalled_at: null,
                    expires_at: new Date('2026-07-18T07:00:19Z'),
                    refresh_token: 'enc',
                    portals: {
                        id: BigInt(7),
                        domain: 'april-dev.bitrix24.ru',
                        member_id: 'member-1',
                        approval_status: 'approved',
                    },
                    _count: { marketplace_install_components: 21 },
                },
            ] as never),
            findInstallById: jest.fn().mockResolvedValue(null),
            findEvents: jest.fn().mockResolvedValue({
                items: [
                    {
                        id: 'event-uuid',
                        member_id: 'member-1',
                        domain: 'april-dev.bitrix24.ru',
                        event: 'ONBOARDING_APPLICATION',
                        status: 'processed',
                        payload: '{}',
                        error_detail: null,
                        created_at: new Date('2026-07-18T06:00:00Z'),
                    },
                ],
                total: 1,
            } as never),
            findPortalProducts: jest.fn().mockResolvedValue([
                {
                    product_code: 'sales',
                    status: 'active',
                    activated_at: new Date('2026-07-18T10:00:00Z'),
                    paid_until: null,
                },
            ] as never),
        };
        httpPost = jest.fn().mockReturnValue(
            of(
                axiosOk({
                    provisionDispatched: true,
                    provisionJobId: 'mp-provision:member-1:sales',
                }),
            ),
        );
        telegram = { sendMessage: jest.fn().mockResolvedValue(undefined) };

        const configService = {
            get: jest.fn((key: string) => {
                if (key === 'PBX_API_URL') return 'https://pbx.test';
                if (key === 'MARKETPLACE_ADMIN_KEY') return 'admin-key';
                return undefined;
            }),
        } as unknown as ConfigService;

        service = new MarketplaceModerationService(
            repo as unknown as MarketplaceModerationRepository,
            { post: httpPost } as unknown as HttpService,
            configService,
            telegram as unknown as TelegramService,
        );
    });

    it('approve: клиент → active, вызов pbx-активации, журнал, telegram', async () => {
        const result = await service.decide(
            7,
            { action: ApprovalAction.APPROVE },
            'admin',
        );

        expect(repo.updateClientStatus).toHaveBeenCalledWith(
            BigInt(5),
            'active',
        );
        expect(httpPost).toHaveBeenCalledWith(
            'https://pbx.test/api/bitrix-marketplace/admin/products/activate',
            expect.objectContaining({
                memberId: 'member-1',
                productCode: 'sales',
                approvedBy: 'admin',
            }),
            expect.objectContaining({
                headers: { 'X-Admin-Key': 'admin-key' },
            }),
        );
        expect(repo.logModerationEvent).toHaveBeenCalledWith(
            expect.objectContaining({ event: 'MODERATION_APPROVE' }),
        );
        expect(telegram.sendMessage).toHaveBeenCalled();
        expect(result.approvalStatus).toBe('approved');
        expect(result.provisionDispatched).toBe(true);
        expect(result.provisionJobId).toBe('mp-provision:member-1:sales');
    });

    it('approve: ответ pbx обёрнут ResponseInterceptor ({data:...}) — разворачивается', async () => {
        httpPost.mockReturnValue(
            of(
                axiosOk({
                    data: {
                        provisionDispatched: true,
                        provisionJobId: 'job-1',
                    },
                }),
            ),
        );
        const result = await service.decide(7, {
            action: ApprovalAction.APPROVE,
        });
        expect(result.provisionJobId).toBe('job-1');
    });

    it('approve при недоступном pbx → BadGatewayException + журнал ошибки', async () => {
        httpPost.mockReturnValue(
            throwError(() => new AxiosError('ECONNREFUSED')),
        );

        await expect(
            service.decide(7, { action: ApprovalAction.APPROVE }, 'admin'),
        ).rejects.toBeInstanceOf(BadGatewayException);
        expect(repo.logModerationEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'MODERATION_APPROVE',
                status: 'error',
            }),
        );
    });

    it('block: портал blocked + клиент disabled, pbx НЕ вызывается', async () => {
        const result = await service.decide(
            7,
            { action: ApprovalAction.BLOCK, comment: 'нарушение' },
            'admin',
        );

        expect(repo.setPortalBlocked).toHaveBeenCalledWith(BigInt(7));
        expect(repo.updateClientStatus).toHaveBeenCalledWith(
            BigInt(5),
            'disabled',
        );
        expect(httpPost).not.toHaveBeenCalled();
        expect(result.approvalStatus).toBe('blocked');
        expect(result.provisionDispatched).toBe(false);
    });

    it('detach: допуск pending + организация отвязана, клиент НЕ disabled', async () => {
        const result = await service.decide(
            7,
            { action: ApprovalAction.DETACH, comment: 'смена владельца' },
            'admin',
        );

        expect(repo.detachPortal).toHaveBeenCalledWith(BigInt(7));
        // отвязка ≠ блокировка: клиент остаётся как есть
        expect(repo.updateClientStatus).not.toHaveBeenCalled();
        expect(httpPost).not.toHaveBeenCalled();
        expect(repo.logModerationEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'PORTAL_DETACHED',
                status: 'processed',
            }),
        );
        expect(result.approvalStatus).toBe('pending');
        expect(result.action).toBe(ApprovalAction.DETACH);
    });

    it('портал не найден → NotFoundException', async () => {
        repo.findPortalById.mockResolvedValue(null);
        await expect(
            service.decide(99, { action: ApprovalAction.APPROVE }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('не-маркетплейс портал → BadRequestException', async () => {
        repo.findPortalById.mockResolvedValue(
            portalFixture({ source: 'legacy' } as never),
        );
        await expect(
            service.decide(7, { action: ApprovalAction.APPROVE }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('сбой Telegram НЕ роняет approve (best-effort)', async () => {
        telegram.sendMessage.mockRejectedValue(new Error('tg down'));
        const result = await service.decide(7, {
            action: ApprovalAction.APPROVE,
        });
        expect(result.approvalStatus).toBe('approved');
    });

    it('getApplications: маппинг заявки (организация, токен-диагностика)', async () => {
        const [dto] = await service.getApplications({});
        expect(dto.portalId).toBe('7');
        expect(dto.organizationName).toBe('ООО «Ромашка»');
        expect(dto.hasRefreshToken).toBe(true);
        expect(dto.installStatus).toBe('installed');
    });

    it('getInstalls: маппинг установки (портал, статусы, счётчик компонентов)', async () => {
        const [dto] = await service.getInstalls({ domain: 'april' });

        expect(repo.findInstalls).toHaveBeenCalledWith(
            expect.objectContaining({ domain: 'april' }),
        );
        expect(dto.installId).toBe('install-uuid');
        expect(dto.portalId).toBe('7');
        expect(dto.memberId).toBe('member-1');
        expect(dto.approvalStatus).toBe('approved');
        expect(dto.hasRefreshToken).toBe(true);
        expect(dto.componentsCount).toBe(21);
    });

    it('getInstall: не найдена → NotFoundException', async () => {
        await expect(service.getInstall('ghost')).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it('getEvents: дефолтная пагинация take=50/skip=0, маппинг и total', async () => {
        const page = await service.getEvents({});

        expect(repo.findEvents).toHaveBeenCalledWith(
            expect.objectContaining({ take: 50, skip: 0 }),
        );
        expect(page.total).toBe(1);
        expect(page.items[0]).toEqual(
            expect.objectContaining({
                event: 'ONBOARDING_APPLICATION',
                memberId: 'member-1',
                createdAt: '2026-07-18T06:00:00.000Z',
            }),
        );
    });

    it('getPortalProducts: маппинг продуктов портала', async () => {
        const [product] = await service.getPortalProducts(7);
        expect(product).toEqual(
            expect.objectContaining({ code: 'sales', status: 'active' }),
        );
    });

    it('provisionRefresh: прокси в pbx provision/refresh с X-Admin-Key', async () => {
        const result = await service.provisionRefresh(7);

        expect(httpPost).toHaveBeenCalledWith(
            'https://pbx.test/api/bitrix-marketplace/admin/provision/refresh',
            expect.objectContaining({
                memberId: 'member-1',
                productCode: 'sales',
            }),
            expect.objectContaining({
                headers: { 'X-Admin-Key': 'admin-key' },
            }),
        );
        expect(result.ok).toBe(true);
    });

    it('placementsRefresh при недоступном pbx → BadGateway + журнал события', async () => {
        httpPost.mockReturnValue(
            throwError(() => new AxiosError('ECONNREFUSED')),
        );

        await expect(service.placementsRefresh(7)).rejects.toBeInstanceOf(
            BadGatewayException,
        );
        expect(repo.logModerationEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'MODERATION_PLACEMENTS_REFRESH',
                status: 'error',
            }),
        );
    });

    it('provisionRefresh на не-marketplace портале → BadRequestException', async () => {
        repo.findPortalById.mockResolvedValue(
            portalFixture({ source: 'legacy' } as never),
        );
        await expect(service.provisionRefresh(7)).rejects.toBeInstanceOf(
            BadRequestException,
        );
        expect(httpPost).not.toHaveBeenCalled();
    });
});
