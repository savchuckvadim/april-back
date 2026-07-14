import { ConfigService } from '@nestjs/config';
import { MarketplaceInstallService } from '../services/marketplace-install.service';
import { InstallChannel } from '../lib/parse-install-params.util';
import {
    InstallStatus,
    MarketplaceInstallRepository,
} from '../persistence/marketplace-install.repository';
import { MarketplacePlacementSyncService } from '../services/marketplace-placement-sync.service';
import { MarketplaceEventSyncService } from '../services/marketplace-event-sync.service';

type RepoMock = jest.Mocked<
    Pick<
        MarketplaceInstallRepository,
        | 'upsertPortal'
        | 'upsertInstall'
        | 'updateInstallStatus'
        | 'upsertComponents'
        | 'logEvent'
    >
>;
type EventSyncMock = jest.Mocked<
    Pick<MarketplaceEventSyncService, 'syncEvents'>
>;
type SyncMock = jest.Mocked<
    Pick<MarketplacePlacementSyncService, 'syncPlacements'>
>;

describe('MarketplaceInstallService (пайплайн установки)', () => {
    let service: MarketplaceInstallService;
    let repo: RepoMock;
    let eventSync: EventSyncMock;
    let sync: SyncMock;

    const onAppInstallBody = {
        event: 'ONAPPINSTALL',
        auth: JSON.stringify({
            access_token: 'at',
            refresh_token: 'rt',
            expires_in: 3600,
            application_token: 'app-token',
            domain: 'portal.bitrix24.ru',
            member_id: 'member-1',
        }),
    };

    beforeEach(() => {
        repo = {
            upsertPortal: jest
                .fn()
                .mockResolvedValue({ id: BigInt(1), member_id: 'member-1' }),
            upsertInstall: jest.fn().mockResolvedValue({ id: 'install-uuid' }),
            updateInstallStatus: jest.fn().mockResolvedValue(undefined),
            upsertComponents: jest.fn().mockResolvedValue(undefined),
            logEvent: jest.fn().mockResolvedValue(undefined),
        };
        eventSync = {
            syncEvents: jest.fn().mockResolvedValue({
                bound: 3,
                unbound: 0,
                errors: 0,
                total: 3,
            }),
        };
        sync = {
            syncPlacements: jest.fn().mockResolvedValue({
                bound: 4,
                unbound: 0,
                errors: 0,
                total: 4,
            }),
        };
        const configService = {
            get: jest.fn().mockReturnValue(undefined),
        } as unknown as ConfigService;

        service = new MarketplaceInstallService(
            repo as unknown as MarketplaceInstallRepository,
            eventSync as unknown as MarketplaceEventSyncService,
            sync as unknown as MarketplacePlacementSyncService,
            configService,
        );
    });

    it('успешная установка: токены → sync событий → sync привязок → installed', async () => {
        const result = await service.installFromBitrixRequest(
            onAppInstallBody,
            undefined,
        );

        expect(result.status).toBe('success');
        expect(result.channel).toBe(InstallChannel.EVENT);
        expect(result.appId).toBe('install-uuid');

        // портал по member_id + домену
        expect(repo.upsertPortal).toHaveBeenCalledWith({
            memberId: 'member-1',
            domain: 'portal.bitrix24.ru',
        });
        // события синхронизированы ДО привязок виджетов
        expect(eventSync.syncEvents).toHaveBeenCalledWith(
            'portal.bitrix24.ru',
            'at',
        );
        const eventsOrder = eventSync.syncEvents.mock.invocationCallOrder[0];
        const placementsOrder = sync.syncPlacements.mock.invocationCallOrder[0];
        expect(eventsOrder).toBeLessThan(placementsOrder);
        // привязки виджетов синхронизированы с эталоном
        expect(sync.syncPlacements).toHaveBeenCalledWith(
            'portal.bitrix24.ru',
            'at',
            'install-uuid',
            BigInt(1),
        );
        // финальный статус — installed
        expect(repo.updateInstallStatus).toHaveBeenLastCalledWith(
            'install-uuid',
            InstallStatus.INSTALLED,
        );
    });

    it('iframe-канал (PLACEMENT=DEFAULT) проходит тот же пайплайн', async () => {
        const result = await service.installFromBitrixRequest(
            {
                PLACEMENT: 'DEFAULT',
                AUTH_ID: 'at',
                REFRESH_ID: 'rt',
                AUTH_EXPIRES: '3600',
                member_id: 'member-1',
                APP_SID: 'sid',
            },
            { DOMAIN: 'portal.bitrix24.ru' },
        );

        expect(result.status).toBe('success');
        expect(result.channel).toBe(InstallChannel.PLACEMENT);
        expect(eventSync.syncEvents).toHaveBeenCalled();
    });

    it('нет токенов → fail, пайплайн не запускается', async () => {
        const result = await service.installFromBitrixRequest(
            { PLACEMENT: 'DEFAULT' },
            { DOMAIN: 'portal.bitrix24.ru' },
        );

        expect(result.status).toBe('fail');
        expect(repo.upsertPortal).not.toHaveBeenCalled();
        expect(eventSync.syncEvents).not.toHaveBeenCalled();
    });

    it('ошибка синхронизации привязок → status=error с шагом placements', async () => {
        sync.syncPlacements.mockRejectedValue(
            new Error('placement.bind failed: CRM_DEAL_DETAIL_TAB/event-sales'),
        );

        const result = await service.installFromBitrixRequest(
            onAppInstallBody,
            undefined,
        );

        expect(result.status).toBe('fail');
        expect(repo.updateInstallStatus).toHaveBeenCalledWith(
            'install-uuid',
            InstallStatus.ERROR,
            'placements',
            expect.stringContaining('placement.bind'),
        );
    });

    it('ошибка синхронизации событий → status=error с шагом events', async () => {
        eventSync.syncEvents.mockRejectedValue(
            new Error('event.bind failed: ONAPPUNINSTALL: ERR'),
        );

        const result = await service.installFromBitrixRequest(
            onAppInstallBody,
            undefined,
        );

        expect(result.status).toBe('fail');
        expect(repo.updateInstallStatus).toHaveBeenCalledWith(
            'install-uuid',
            InstallStatus.ERROR,
            'events',
            expect.stringContaining('event.bind'),
        );
    });

    it('storeFromPayload (открытие): обновляет токены, статус не трогает', async () => {
        const result = await service.storeFromPayload({
            channel: InstallChannel.OPEN,
            access_token: 'at2',
            refresh_token: 'rt2',
            expires_in: 3600,
            domain: 'portal.bitrix24.ru',
            member_id: 'member-1',
        });

        expect(result.status).toBe('success');
        expect(repo.upsertInstall).toHaveBeenCalled();
        expect(repo.updateInstallStatus).not.toHaveBeenCalled();
        expect(eventSync.syncEvents).not.toHaveBeenCalled();
        expect(sync.syncPlacements).not.toHaveBeenCalled();
    });
});
