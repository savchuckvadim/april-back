import { ConfigService } from '@nestjs/config';
import { Portal } from 'generated/prisma';
import { MarketplaceInstallService } from '../services/marketplace-install.service';
import { InstallChannel } from '../lib/parse-install-params.util';
import {
    InstallStatus,
    MarketplaceInstallRepository,
} from '../persistence/marketplace-install.repository';
import { MarketplaceEventSyncService } from '../services/marketplace-event-sync.service';
import { MarketplaceLocalAppService } from '../services/marketplace-local-app.service';

type RepoMock = jest.Mocked<
    Pick<
        MarketplaceInstallRepository,
        | 'upsertPortal'
        | 'upsertInstall'
        | 'updateInstallStatus'
        | 'upsertComponents'
        | 'findPortalProducts'
        | 'logEvent'
    >
>;
type EventSyncMock = jest.Mocked<
    Pick<MarketplaceEventSyncService, 'syncEvents'>
>;
type LocalAppMock = jest.Mocked<
    Pick<MarketplaceLocalAppService, 'onPortalInstalled'>
>;

const PORTAL = { id: BigInt(1), member_id: 'member-1' } as Portal;

describe('MarketplaceInstallService (пайплайн установки)', () => {
    let service: MarketplaceInstallService;
    let repo: RepoMock;
    let eventSync: EventSyncMock;
    let localApp: LocalAppMock;

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
                .mockResolvedValue({ portal: PORTAL, created: false }),
            upsertInstall: jest.fn().mockResolvedValue({ id: 'install-uuid' }),
            updateInstallStatus: jest.fn().mockResolvedValue(undefined),
            upsertComponents: jest.fn().mockResolvedValue(undefined),
            findPortalProducts: jest.fn().mockResolvedValue([]),
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
        localApp = {
            onPortalInstalled: jest.fn().mockResolvedValue(undefined),
        };
        const configService = {
            get: jest.fn().mockReturnValue(undefined),
        } as unknown as ConfigService;

        service = new MarketplaceInstallService(
            repo as unknown as MarketplaceInstallRepository,
            eventSync as unknown as MarketplaceEventSyncService,
            localApp as unknown as MarketplaceLocalAppService,
            configService,
        );
    });

    it('успешная установка: токены → правила локального приложения → sync событий → installed', async () => {
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
        // правила локального приложения знают, создан ли портал установкой
        expect(localApp.onPortalInstalled).toHaveBeenCalledWith({
            portal: PORTAL,
            created: false,
            domain: 'portal.bitrix24.ru',
            memberId: 'member-1',
        });
        expect(eventSync.syncEvents).toHaveBeenCalledWith(
            'portal.bitrix24.ru',
            'at',
        );
        // финальный статус — installed
        expect(repo.updateInstallStatus).toHaveBeenLastCalledWith(
            'install-uuid',
            InstallStatus.INSTALLED,
        );
    });

    /*
     * На действующих порталах виджеты уже стоят старыми привязками —
     * автоматическая установка дала бы дубли (решение владельца 07.11.2026).
     * Виджеты ставит только админ по списку app_widgets.
     */
    it('виджеты при установке не ставятся: статус placements_bound не выставляется, компонентов placement нет', async () => {
        await service.installFromBitrixRequest(onAppInstallBody, undefined);

        const statuses = repo.updateInstallStatus.mock.calls.map(
            call => call[1],
        );
        expect(statuses).not.toContain(InstallStatus.PLACEMENTS_BOUND);
        const componentTypes = repo.upsertComponents.mock.calls.flatMap(call =>
            call[2].map(component => component.componentType),
        );
        expect(componentTypes).not.toContain('placement');
    });

    it('новый портал (создан установкой) → правила локального приложения получают created=true', async () => {
        repo.upsertPortal.mockResolvedValue({ portal: PORTAL, created: true });

        await service.installFromBitrixRequest(onAppInstallBody, undefined);

        expect(localApp.onPortalInstalled).toHaveBeenCalledWith(
            expect.objectContaining({ created: true }),
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
        expect(localApp.onPortalInstalled).not.toHaveBeenCalled();
        expect(eventSync.syncEvents).not.toHaveBeenCalled();
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

    it('storeFromPayload (открытие): обновляет токены, статус и правила не трогает', async () => {
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
        expect(localApp.onPortalInstalled).not.toHaveBeenCalled();
    });
});
