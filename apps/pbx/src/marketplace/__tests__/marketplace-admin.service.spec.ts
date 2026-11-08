import { BadRequestException } from '@nestjs/common';
import { MarketplaceTokenService } from '@lib/marketplace-core';
import {
    EnumPortalAppCode,
    getPortalAppDefaults,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
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
            {} as PortalAppSettingsService,
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

/**
 * Виджеты ставятся ТОЛЬКО отсюда и только по списку `app_widgets` из
 * «Общих настроек портала» (при установке приложения — никогда).
 */
describe('MarketplaceAdminService.refreshPlacements (виджеты по настройке портала)', () => {
    const portalDefaults = getPortalAppDefaults(EnumPortalAppCode.portal);
    let repo: jest.Mocked<
        Pick<MarketplaceInstallRepository, 'findInstallByMemberId'>
    >;
    let sync: jest.Mocked<
        Pick<MarketplacePlacementSyncService, 'syncPlacements'>
    >;
    let token: jest.Mocked<
        Pick<MarketplaceTokenService, 'getFreshAccessToken'>
    >;
    let settings: jest.Mocked<Pick<PortalAppSettingsService, 'resolve'>>;
    let service: MarketplaceAdminService;

    beforeEach(() => {
        repo = {
            findInstallByMemberId: jest.fn().mockResolvedValue({
                ...installFixture(),
                portal_id: BigInt(1),
            }),
        };
        sync = {
            syncPlacements: jest.fn().mockResolvedValue({
                bound: 2,
                unbound: 0,
                errors: 0,
                total: 2,
            }),
        };
        token = {
            getFreshAccessToken: jest.fn().mockResolvedValue('fresh-at'),
        };
        settings = {
            resolve: jest.fn().mockResolvedValue({
                ...portalDefaults,
                appWidgets: 'event-sales, report-sales, bogus',
            }),
        };
        service = new MarketplaceAdminService(
            repo as unknown as MarketplaceInstallRepository,
            sync as unknown as MarketplacePlacementSyncService,
            token as unknown as MarketplaceTokenService,
            settings as unknown as PortalAppSettingsService,
        );
    });

    it('список виджетов берётся из настройки портала, чужие коды отбрасываются', async () => {
        await service.refreshPlacements({ memberId: 'member-1' });

        expect(settings.resolve).toHaveBeenCalledWith(
            'portal.bitrix24.ru',
            EnumPortalAppCode.portal,
        );
        expect(sync.syncPlacements).toHaveBeenCalledWith(
            'portal.bitrix24.ru',
            'fresh-at',
            'install-uuid',
            BigInt(1),
            ['event-sales', 'report-sales'],
            { force: false },
        );
    });

    it('переустановка: флаг force уходит в синхронизацию', async () => {
        await service.refreshPlacements({ memberId: 'member-1', force: true });

        expect(sync.syncPlacements).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(String),
            expect.any(String),
            expect.anything(),
            expect.any(Array),
            { force: true },
        );
    });

    it('настройка пуста (действующий портал) → синхронизация получает пустой список', async () => {
        settings.resolve.mockResolvedValue(portalDefaults);

        await service.refreshPlacements({ memberId: 'member-1' });

        expect(sync.syncPlacements).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(String),
            expect.any(String),
            expect.anything(),
            [],
            { force: false },
        );
    });

    it('приложение удалено с портала → BadRequestException без синхронизации', async () => {
        repo.findInstallByMemberId.mockResolvedValue({
            ...installFixture(),
            uninstalled_at: new Date(),
        });

        await expect(
            service.refreshPlacements({ memberId: 'member-1' }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(sync.syncPlacements).not.toHaveBeenCalled();
    });
});
