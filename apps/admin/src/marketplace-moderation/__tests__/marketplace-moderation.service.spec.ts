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
        | 'findComponentsByPortal'
        | 'logModerationEvent'
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
            findComponentsByPortal: jest.fn().mockResolvedValue([]),
            logModerationEvent: jest.fn().mockResolvedValue(undefined),
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
});
