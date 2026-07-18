import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QueueDispatcherService } from '@lib/queue';
import { MarketplaceComponentType } from '@lib/marketplace-core';
import { MarketplaceProductService } from '../services/marketplace-product.service';
import { MarketplaceInstallRepository } from '../persistence/marketplace-install.repository';
import { MarketplaceProduct } from '../config/marketplace-manifest';

type RepoMock = jest.Mocked<
    Pick<
        MarketplaceInstallRepository,
        | 'findInstallByMemberId'
        | 'findInstallByDomain'
        | 'setApprovalStatus'
        | 'upsertPortalProduct'
        | 'findPortalProducts'
        | 'upsertComponents'
        | 'logEvent'
    >
>;
type DispatcherMock = jest.Mocked<Pick<QueueDispatcherService, 'dispatch'>>;

const install = (over: Record<string, unknown> = {}) => ({
    id: 'install-uuid',
    uninstalled_at: null,
    portals: {
        id: BigInt(7),
        domain: 'april-dev.bitrix24.ru',
        member_id: 'member-1',
        approval_status: 'pending',
    },
    ...over,
});

describe('MarketplaceProductService (активация продукта = approve)', () => {
    let service: MarketplaceProductService;
    let repo: RepoMock;
    let dispatcher: DispatcherMock;

    beforeEach(() => {
        repo = {
            findInstallByMemberId: jest.fn().mockResolvedValue(install()),
            findInstallByDomain: jest.fn().mockResolvedValue(install()),
            setApprovalStatus: jest.fn().mockResolvedValue(undefined),
            upsertPortalProduct: jest.fn().mockResolvedValue({
                id: 'product-uuid',
                product_code: 'sales',
                status: 'active',
            }),
            findPortalProducts: jest
                .fn()
                .mockResolvedValue([
                    { product_code: 'sales', status: 'active' },
                ]),
            upsertComponents: jest.fn().mockResolvedValue(undefined),
            logEvent: jest.fn().mockResolvedValue(undefined),
        };
        dispatcher = {
            dispatch: jest.fn().mockResolvedValue({ id: 'job' }),
        };
        service = new MarketplaceProductService(
            repo as unknown as MarketplaceInstallRepository,
            dispatcher as unknown as QueueDispatcherService,
        );
    });

    it('активация: допуск approved + продукт active + компонент pending + dispatch', async () => {
        const result = await service.activateProduct({
            memberId: 'member-1',
            productCode: MarketplaceProduct.SALES,
            approvedBy: 'admin',
        });

        expect(repo.setApprovalStatus).toHaveBeenCalledWith(
            BigInt(7),
            'approved',
            'admin',
        );
        expect(repo.upsertPortalProduct).toHaveBeenCalledWith(
            BigInt(7),
            MarketplaceProduct.SALES,
            'active',
        );
        expect(repo.upsertComponents).toHaveBeenCalledWith(
            'install-uuid',
            BigInt(7),
            [
                expect.objectContaining({
                    componentType: MarketplaceComponentType.PBX_ENTITIES,
                    status: 'pending',
                    reasonCode: 'queued',
                }),
            ],
        );
        expect(dispatcher.dispatch).toHaveBeenCalledWith(
            'marketplace-provision',
            'marketplace-provision-product',
            expect.objectContaining({
                domain: 'april-dev.bitrix24.ru',
                memberId: 'member-1',
                productCode: MarketplaceProduct.SALES,
                trigger: 'approve',
            }),
            'mp-provision:member-1:sales',
            expect.objectContaining({
                attempts: 3,
                removeOnComplete: true,
            }),
        );
        expect(result.provisionDispatched).toBe(true);
        expect(result.provisionJobId).toBe('mp-provision:member-1:sales');
        expect(result.approvalStatus).toBe('approved');
    });

    it('идемпотентность: повторный approve не падает (upsert + стабильный jobId)', async () => {
        await service.activateProduct({
            memberId: 'member-1',
            productCode: MarketplaceProduct.SALES,
        });
        await service.activateProduct({
            memberId: 'member-1',
            productCode: MarketplaceProduct.SALES,
        });

        expect(dispatcher.dispatch).toHaveBeenCalledTimes(2);
        expect(dispatcher.dispatch).toHaveBeenLastCalledWith(
            expect.any(String),
            expect.any(String),
            expect.any(Object),
            'mp-provision:member-1:sales',
            expect.any(Object),
        );
    });

    it('без memberId и domain → BadRequestException', async () => {
        await expect(
            service.activateProduct({
                productCode: MarketplaceProduct.SALES,
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('установка не найдена → NotFoundException', async () => {
        repo.findInstallByMemberId.mockResolvedValue(null);
        await expect(
            service.activateProduct({
                memberId: 'ghost',
                productCode: MarketplaceProduct.SALES,
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('удалённая установка → BadRequestException, ничего не активируется', async () => {
        repo.findInstallByMemberId.mockResolvedValue(
            install({ uninstalled_at: new Date() }) as never,
        );
        await expect(
            service.activateProduct({
                memberId: 'member-1',
                productCode: MarketplaceProduct.SALES,
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(repo.setApprovalStatus).not.toHaveBeenCalled();
    });

    it('redispatch: только dispatch, допуск/продукт не трогаются', async () => {
        const result = await service.redispatchProvision({
            memberId: 'member-1',
            productCode: MarketplaceProduct.SALES,
        });

        expect(repo.setApprovalStatus).not.toHaveBeenCalled();
        expect(repo.upsertPortalProduct).not.toHaveBeenCalled();
        expect(dispatcher.dispatch).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(String),
            expect.objectContaining({ trigger: 'admin_refresh' }),
            expect.any(String),
            expect.any(Object),
        );
        expect(result.provisionDispatched).toBe(true);
    });

    it('redispatch без активированного продукта → BadRequestException', async () => {
        repo.findPortalProducts.mockResolvedValue([] as never);
        await expect(
            service.redispatchProvision({
                memberId: 'member-1',
                productCode: MarketplaceProduct.SALES,
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });
});
