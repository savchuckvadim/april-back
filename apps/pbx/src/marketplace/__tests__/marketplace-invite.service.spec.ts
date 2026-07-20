import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    HttpException,
    NotFoundException,
} from '@nestjs/common';
import { hashInviteCode } from '@lib/marketplace-core';
import { RedisService } from '@/core/redis/redis.service';
import { MarketplaceInviteService } from '../services/marketplace-invite.service';
import { MarketplaceInstallRepository } from '../persistence/marketplace-install.repository';
import { MarketplaceProductService } from '../services/marketplace-product.service';
import { MarketplaceProduct } from '../config/marketplace-manifest';

type RepoMock = jest.Mocked<
    Pick<
        MarketplaceInstallRepository,
        | 'findInstallWithClient'
        | 'findRedeemableInvite'
        | 'markInviteRedeemed'
        | 'attachClientToPortal'
        | 'setApprovalStatus'
        | 'upsertPortalProduct'
        | 'logEvent'
    >
>;
type ProductMock = jest.Mocked<
    Pick<MarketplaceProductService, 'activateProduct'>
>;

const CODE = 'GRNT-AB12-CD34';

const install = (over: Record<string, unknown> = {}) => ({
    id: 'install-uuid',
    uninstalled_at: null,
    portals: {
        id: BigInt(7),
        domain: 'april-dev.bitrix24.ru',
        member_id: 'member-1',
        approval_status: 'pending',
        client_id: null,
        clients: null,
    },
    ...over,
});

const invite = (over: Record<string, unknown> = {}) => ({
    id: 'invite-uuid',
    client_id: BigInt(5),
    product_code: 'sales',
    auto_provision: true,
    organization: 'ООО «Ромашка»',
    ...over,
});

describe('MarketplaceInviteService (погашение кода подключения)', () => {
    let service: MarketplaceInviteService;
    let repo: RepoMock;
    let productService: ProductMock;
    let redisClient: { incr: jest.Mock; expire: jest.Mock; del: jest.Mock };

    beforeEach(() => {
        repo = {
            findInstallWithClient: jest.fn().mockResolvedValue(install()),
            findRedeemableInvite: jest.fn().mockResolvedValue(invite()),
            markInviteRedeemed: jest.fn().mockResolvedValue(undefined),
            attachClientToPortal: jest.fn().mockResolvedValue({}),
            setApprovalStatus: jest.fn().mockResolvedValue(undefined),
            upsertPortalProduct: jest
                .fn()
                .mockResolvedValue({ status: 'inactive' }),
            logEvent: jest.fn().mockResolvedValue(undefined),
        };
        productService = {
            activateProduct: jest.fn().mockResolvedValue({
                portalId: '7',
                productCode: MarketplaceProduct.SALES,
                approvalStatus: 'approved',
                productStatus: 'active',
                provisionDispatched: true,
                provisionJobId: 'job-1',
            }),
        };
        redisClient = {
            incr: jest.fn().mockResolvedValue(1),
            expire: jest.fn().mockResolvedValue(1),
            del: jest.fn().mockResolvedValue(1),
        };

        service = new MarketplaceInviteService(
            repo as unknown as MarketplaceInstallRepository,
            productService as unknown as MarketplaceProductService,
            { getClient: () => redisClient } as unknown as RedisService,
        );
    });

    it('верный код: портал привязан к клиенту, продукт активирован, код погашен', async () => {
        const result = await service.redeemCode('member-1', CODE);

        // ищем строго по sha256 от нормализованного кода
        expect(repo.findRedeemableInvite).toHaveBeenCalledWith(
            hashInviteCode(CODE),
        );
        expect(repo.attachClientToPortal).toHaveBeenCalledWith(
            BigInt(7),
            BigInt(5),
        );
        expect(productService.activateProduct).toHaveBeenCalledWith(
            expect.objectContaining({
                memberId: 'member-1',
                productCode: 'sales',
                approvedBy: 'invite:invite-uuid',
            }),
        );
        expect(repo.markInviteRedeemed).toHaveBeenCalledWith(
            'invite-uuid',
            BigInt(7),
        );
        expect(result.state).toBe('active');
        expect(result.provisionStarted).toBe(true);
        expect(result.organizationName).toBe('ООО «Ромашка»');
    });

    it('код принимается в любом регистре и с пробелами вместо дефисов', async () => {
        await service.redeemCode('member-1', ' grnt ab12 cd34 ');
        expect(repo.findRedeemableInvite).toHaveBeenCalledWith(
            hashInviteCode(CODE),
        );
    });

    it('auto_provision=false: допуск открыт, продукт inactive, очередь НЕ трогается', async () => {
        repo.findRedeemableInvite.mockResolvedValue(
            invite({ auto_provision: false }) as never,
        );

        const result = await service.redeemCode('member-1', CODE);

        expect(productService.activateProduct).not.toHaveBeenCalled();
        expect(repo.setApprovalStatus).toHaveBeenCalledWith(
            BigInt(7),
            'approved',
            'invite:invite-uuid',
        );
        expect(repo.upsertPortalProduct).toHaveBeenCalledWith(
            BigInt(7),
            'sales',
            'inactive',
        );
        expect(result.provisionStarted).toBe(false);
    });

    it('неизвестный/истёкший код → BadRequest без раскрытия причины + журнал', async () => {
        repo.findRedeemableInvite.mockResolvedValue(null);

        await expect(
            service.redeemCode('member-1', CODE),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(repo.logEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'INVITE_REDEEM_FAILED',
                status: 'error',
            }),
        );
        expect(productService.activateProduct).not.toHaveBeenCalled();
    });

    it('портал привязан к ДРУГОЙ организации → Conflict', async () => {
        repo.findInstallWithClient.mockResolvedValue(
            install({
                portals: {
                    id: BigInt(7),
                    domain: 'april-dev.bitrix24.ru',
                    member_id: 'member-1',
                    approval_status: 'pending',
                    client_id: BigInt(99),
                    clients: null,
                },
            }) as never,
        );

        await expect(
            service.redeemCode('member-1', CODE),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(repo.markInviteRedeemed).not.toHaveBeenCalled();
    });

    it('заблокированный портал → Forbidden', async () => {
        repo.findInstallWithClient.mockResolvedValue(
            install({
                portals: {
                    id: BigInt(7),
                    member_id: 'member-1',
                    approval_status: 'blocked',
                    client_id: null,
                    clients: null,
                },
            }) as never,
        );

        await expect(
            service.redeemCode('member-1', CODE),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('удалённая установка → BadRequest', async () => {
        repo.findInstallWithClient.mockResolvedValue(
            install({ uninstalled_at: new Date() }) as never,
        );
        await expect(
            service.redeemCode('member-1', CODE),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('установки нет вовсе → NotFound', async () => {
        repo.findInstallWithClient.mockResolvedValue(null);
        await expect(
            service.redeemCode('member-1', CODE),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('перебор: 6-я попытка в окне → 429 и код даже не ищется', async () => {
        redisClient.incr.mockResolvedValue(6);

        await expect(service.redeemCode('member-1', CODE)).rejects.toThrow(
            HttpException,
        );
        expect(repo.findRedeemableInvite).not.toHaveBeenCalled();
    });

    it('успешное погашение обнуляет счётчик попыток', async () => {
        await service.redeemCode('member-1', CODE);
        expect(redisClient.del).toHaveBeenCalledWith(
            'mp:invite:attempts:member-1',
        );
    });

    it('Redis недоступен → погашение не блокируется', async () => {
        redisClient.incr.mockRejectedValue(new Error('redis down'));
        const result = await service.redeemCode('member-1', CODE);
        expect(result.state).toBe('active');
    });

    describe('installProduct (кнопка клиента)', () => {
        it('подключённый портал: запускает установку продукта', async () => {
            repo.findInstallWithClient.mockResolvedValue(
                install({
                    portals: {
                        id: BigInt(7),
                        member_id: 'member-1',
                        approval_status: 'approved',
                        client_id: BigInt(5),
                        clients: null,
                    },
                }) as never,
            );

            const result = await service.installProduct(
                'member-1',
                MarketplaceProduct.SALES,
            );

            expect(productService.activateProduct).toHaveBeenCalledWith(
                expect.objectContaining({ approvedBy: 'client:cabinet' }),
            );
            expect(result.provisionStarted).toBe(true);
        });

        it('портал без подключения → Forbidden', async () => {
            await expect(
                service.installProduct('member-1', MarketplaceProduct.SALES),
            ).rejects.toBeInstanceOf(ForbiddenException);
            expect(productService.activateProduct).not.toHaveBeenCalled();
        });
    });
});
