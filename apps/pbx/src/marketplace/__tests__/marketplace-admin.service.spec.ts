import { BadRequestException } from '@nestjs/common';
import { MarketplaceTokenService } from '@lib/marketplace-core';
import { MarketplaceAdminService } from '../services/marketplace-admin.service';
import {
    InstallWithDetails,
    MarketplaceInstallRepository,
} from '../persistence/marketplace-install.repository';
import { MarketplacePlacementSyncService } from '../services/marketplace-placement-sync.service';

type RepoMock = jest.Mocked<
    Pick<MarketplaceInstallRepository, 'findInstallsWithComponents'>
>;

function installFixture(): InstallWithDetails {
    return {
        id: 'install-uuid',
        created_at: new Date('2026-07-13T21:44:23Z'),
        updated_at: new Date('2026-07-13T21:44:59Z'),
        portal_id: BigInt(1),
        bitrix_app_id: null,
        app_code: 'garant_manager',
        domain: 'portal.bitrix24.ru',
        install_status: 'installed',
        error_step: null,
        error_detail: null,
        scope: 'crm,placement',
        version: '1',
        lang: 'ru',
        license_status: null,
        payment_expired: null,
        license_days: null,
        license_checked_at: null,
        access_token: 'encrypted-at',
        refresh_token: 'encrypted-rt',
        expires_at: new Date('2026-07-13T22:44:23Z'),
        application_token: 'encrypted-app',
        installed_at: new Date('2026-07-13T21:44:23Z'),
        uninstalled_at: null,
        portals: {
            member_id: 'member-1',
            domain: 'portal.bitrix24.ru',
        } as InstallWithDetails['portals'],
        marketplace_install_components: [
            {
                id: 'comp-uuid',
                created_at: new Date(),
                updated_at: new Date(),
                marketplace_install_id: 'install-uuid',
                portal_id: BigInt(1),
                product_code: 'sales',
                component_type: 'placement',
                component_code: 'CRM_DEAL_DETAIL_TAB:event-sales',
                status: 'installed',
                reason_code: null,
                error_detail: null,
                attempts: 1,
                last_attempt_at: new Date('2026-07-13T21:44:23Z'),
            },
        ],
    };
}

describe('MarketplaceAdminService.getInstalls (диагностика установок)', () => {
    let service: MarketplaceAdminService;
    let repo: RepoMock;

    beforeEach(() => {
        repo = {
            findInstallsWithComponents: jest
                .fn()
                .mockResolvedValue([installFixture()]),
        };
        service = new MarketplaceAdminService(
            repo as unknown as MarketplaceInstallRepository,
            {} as MarketplacePlacementSyncService,
            {} as MarketplaceTokenService,
        );
    });

    it('маппит установку с компонентами, токены НЕ возвращаются', async () => {
        const result = await service.getInstalls({
            domain: 'portal.bitrix24.ru',
        });

        expect(repo.findInstallsWithComponents).toHaveBeenCalledWith({
            memberId: undefined,
            domain: 'portal.bitrix24.ru',
        });
        expect(result).toHaveLength(1);
        const dto = result[0];
        expect(dto.installId).toBe('install-uuid');
        expect(dto.installStatus).toBe('installed');
        expect(dto.memberId).toBe('member-1');
        expect(dto.hasAccessToken).toBe(true);
        expect(dto.hasApplicationToken).toBe(true);
        expect(dto.tokenExpiresAt).toBe('2026-07-13T22:44:23.000Z');
        expect(dto.components[0].componentCode).toBe(
            'CRM_DEAL_DETAIL_TAB:event-sales',
        );

        // ни одно поле сериализации не содержит значения токенов
        const serialized = JSON.stringify(result);
        expect(serialized).not.toContain('encrypted-at');
        expect(serialized).not.toContain('encrypted-rt');
        expect(serialized).not.toContain('encrypted-app');
        expect(serialized).not.toContain('access_token');
    });

    it('без domain и memberId → BadRequestException', async () => {
        await expect(service.getInstalls({})).rejects.toBeInstanceOf(
            BadRequestException,
        );
        expect(repo.findInstallsWithComponents).not.toHaveBeenCalled();
    });

    it('нет совпадений → пустой массив (не 404)', async () => {
        repo.findInstallsWithComponents.mockResolvedValue([]);

        await expect(
            service.getInstalls({ memberId: 'unknown' }),
        ).resolves.toEqual([]);
    });
});
