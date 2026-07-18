import { NotFoundException } from '@nestjs/common';
import { MarketplaceComponentStateRepository } from '@lib/marketplace-core';
import { MarketplaceCabinetService } from '../services/marketplace-cabinet.service';
import { MarketplaceInstallRepository } from '../persistence/marketplace-install.repository';
import { PortalSessionState } from '../services/marketplace-session.service';

type RepoMock = jest.Mocked<
    Pick<
        MarketplaceInstallRepository,
        'findInstallWithClient' | 'findPortalProducts'
    >
>;
type ComponentStateMock = jest.Mocked<
    Pick<MarketplaceComponentStateRepository, 'findComponents'>
>;

const installFixture = () => ({
    id: 'install-uuid',
    install_status: 'installed',
    uninstalled_at: null,
    portals: {
        id: BigInt(7),
        approval_status: 'approved',
        client_id: BigInt(5),
        clients: {
            id: BigInt(5),
            name: 'ООО «Ромашка»',
            email: 'director@romashka.ru',
        },
    },
});

describe('MarketplaceCabinetService (сводка кабинета)', () => {
    let service: MarketplaceCabinetService;
    let repo: RepoMock;
    let componentState: ComponentStateMock;

    beforeEach(() => {
        repo = {
            findInstallWithClient: jest
                .fn()
                .mockResolvedValue(installFixture()),
            findPortalProducts: jest.fn().mockResolvedValue([
                {
                    product_code: 'sales',
                    status: 'active',
                    activated_at: new Date('2026-07-18T10:00:00Z'),
                },
            ]),
        };
        componentState = {
            findComponents: jest.fn().mockResolvedValue([
                {
                    product_code: 'sales',
                    component_type: 'pbx_entities',
                    component_code: '',
                    status: 'installed',
                    reason_code: null,
                },
                {
                    product_code: 'sales',
                    component_type: 'pbx_entities',
                    component_code: 'rpa:sales',
                    status: 'skipped',
                    reason_code: 'tariff_restricted',
                },
            ]),
        };
        service = new MarketplaceCabinetService(
            repo as unknown as MarketplaceInstallRepository,
            componentState as unknown as MarketplaceComponentStateRepository,
        );
    });

    it('сводка: состояние, организация, продукты и компоненты', async () => {
        const summary = await service.getSummary('member-1');

        expect(summary.state).toBe(PortalSessionState.ACTIVE);
        expect(summary.organization?.name).toBe('ООО «Ромашка»');
        expect(summary.products).toEqual([
            {
                code: 'sales',
                status: 'active',
                activatedAt: '2026-07-18T10:00:00.000Z',
            },
        ]);
        expect(summary.components).toHaveLength(2);
        expect(summary.components[1]).toEqual(
            expect.objectContaining({
                componentCode: 'rpa:sales',
                status: 'skipped',
                reasonCode: 'tariff_restricted',
            }),
        );
        expect(summary.installStatus).toBe('installed');
    });

    it('установка не найдена/удалена → NotFoundException', async () => {
        repo.findInstallWithClient.mockResolvedValue(null);
        await expect(service.getSummary('ghost')).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
});
