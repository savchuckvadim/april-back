import { ConfigService } from '@nestjs/config';
import { MarketplaceInstallService } from '../services/marketplace-install.service';
import { InstallChannel } from '../lib/parse-install-params.util';
import {
    InstallStatus,
    MarketplaceInstallRepository,
} from '../persistence/marketplace-install.repository';
import { MarketplaceBxClient } from '../clients/marketplace-bx.client';
import {
    MARKETPLACE_LIFECYCLE_EVENTS,
    SALES_PLACEMENTS,
} from '../config/marketplace-manifest';

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
type BxMock = jest.Mocked<
    Pick<MarketplaceBxClient, 'bindEvent' | 'bindPlacement'>
>;

describe('MarketplaceInstallService (пайплайн установки)', () => {
    let service: MarketplaceInstallService;
    let repo: RepoMock;
    let bx: BxMock;

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
        bx = {
            bindEvent: jest.fn().mockResolvedValue({ ok: true }),
            bindPlacement: jest.fn().mockResolvedValue({ ok: true }),
        };
        const configService = {
            get: jest.fn().mockReturnValue(undefined),
        } as unknown as ConfigService;

        service = new MarketplaceInstallService(
            repo as unknown as MarketplaceInstallRepository,
            bx as unknown as MarketplaceBxClient,
            configService,
        );
    });

    it('успешная установка: токены → event.bind → placement.bind → installed', async () => {
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
        // все lifecycle-события привязаны на /api/bitrix-marketplace/event
        expect(bx.bindEvent).toHaveBeenCalledTimes(
            MARKETPLACE_LIFECYCLE_EVENTS.length,
        );
        expect(bx.bindEvent).toHaveBeenCalledWith(
            'portal.bitrix24.ru',
            'at',
            'ONAPPUNINSTALL',
            'https://api.pbx.april-app.ru/api/bitrix-marketplace/event',
        );
        // все плейсменты sales привязаны
        expect(bx.bindPlacement).toHaveBeenCalledTimes(SALES_PLACEMENTS.length);
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
        expect(bx.bindEvent).toHaveBeenCalled();
    });

    it('нет токенов → fail, пайплайн не запускается', async () => {
        const result = await service.installFromBitrixRequest(
            { PLACEMENT: 'DEFAULT' },
            { DOMAIN: 'portal.bitrix24.ru' },
        );

        expect(result.status).toBe('fail');
        expect(repo.upsertPortal).not.toHaveBeenCalled();
        expect(bx.bindEvent).not.toHaveBeenCalled();
    });

    it('ошибка placement.bind → status=error с шагом placements', async () => {
        bx.bindPlacement.mockResolvedValue({
            ok: false,
            error: 'ERROR',
            errorDescription: 'boom',
        });

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
        // компонент зафиксирован с ошибкой
        expect(repo.upsertComponents).toHaveBeenCalledWith(
            'install-uuid',
            BigInt(1),
            expect.arrayContaining([
                expect.objectContaining({
                    status: 'error',
                    reasonCode: 'bitrix_error',
                }),
            ]),
        );
    });

    it('ошибка event.bind → status=error с шагом events', async () => {
        bx.bindEvent.mockResolvedValue({ ok: false, error: 'ERR' });

        const result = await service.installFromBitrixRequest(
            onAppInstallBody,
            undefined,
        );

        expect(result.status).toBe('fail');
        expect(repo.updateInstallStatus).toHaveBeenCalledWith(
            'install-uuid',
            InstallStatus.ERROR,
            'events',
            expect.any(String),
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
        expect(bx.bindEvent).not.toHaveBeenCalled();
    });
});
