import { ConfigService } from '@nestjs/config';
import { MarketplaceRouterService } from '../services/marketplace-router.service';
import { MarketplaceInstallService } from '../services/marketplace-install.service';
import { InstallChannel } from '../lib/parse-install-params.util';
import { MarketplaceInstallResultDto } from '../dto/marketplace-install.dto';

describe('MarketplaceRouterService', () => {
    let service: MarketplaceRouterService;
    let installService: jest.Mocked<
        Pick<MarketplaceInstallService, 'storeFromPayload'>
    >;

    const openBody = {
        AUTH_ID: 'at',
        REFRESH_ID: 'rt',
        AUTH_EXPIRES: '3600',
        member_id: 'member-1',
        PLACEMENT: 'DEFAULT',
        LANG: 'ru',
    };
    const openQuery = { DOMAIN: 'portal.bitrix24.ru' };

    beforeEach(() => {
        installService = {
            storeFromPayload: jest.fn().mockResolvedValue({
                status: 'success',
                channel: InstallChannel.OPEN,
            } as MarketplaceInstallResultDto),
        };
        const configService = {
            get: jest.fn().mockReturnValue(undefined),
        } as unknown as ConfigService;

        service = new MarketplaceRouterService(
            installService as unknown as MarketplaceInstallService,
            configService,
        );
    });

    it('открытие приложения: сохраняет токены и строит redirect на кабинет', async () => {
        const result = await service.handleAppOpen(openBody, openQuery);

        expect(installService.storeFromPayload).toHaveBeenCalledTimes(1);
        expect(result.status).toBe('success');

        const url = new URL(result.redirectUrl);
        expect(url.origin + url.pathname).toBe(
            'https://bitrix.april-app.ru/bitrix/cabinet',
        );
        expect(url.searchParams.get('domain')).toBe('portal.bitrix24.ru');
        expect(url.searchParams.get('member_id')).toBe('member-1');
        expect(url.searchParams.get('lang')).toBe('ru');
        expect(url.searchParams.get('status')).toBe('success');
    });

    it('открытие плейсмента: redirect на базу плейсментов с кодом из манифеста и PLACEMENT_OPTIONS', async () => {
        const result = await service.handlePlacementOpen(
            'event-sales',
            {
                ...openBody,
                PLACEMENT: 'CRM_DEAL_DETAIL_TAB',
                PLACEMENT_OPTIONS: '{"ID":"1"}',
            },
            openQuery,
        );

        const url = new URL(result.redirectUrl);
        expect(url.pathname).toBe('/portal/placement/event-sales');
        expect(url.searchParams.get('placement_options')).toBe('{"ID":"1"}');
        expect(result.placement).toBe('CRM_DEAL_DETAIL_TAB');
    });

    it('неизвестный код плейсмента: fail + redirect в кабинет с reason=unknown_placement, токены не сохраняются', async () => {
        const result = await service.handlePlacementOpen(
            'no-such-widget',
            openBody,
            openQuery,
        );

        expect(result.status).toBe('fail');
        expect(installService.storeFromPayload).not.toHaveBeenCalled();

        const url = new URL(result.redirectUrl);
        expect(url.origin + url.pathname).toBe(
            'https://bitrix.april-app.ru/bitrix/cabinet',
        );
        expect(url.searchParams.get('reason')).toBe('unknown_placement');
        expect(url.searchParams.get('status')).toBe('fail');
    });

    it('открытие без токенов: fail в статусе, но redirect всё равно строится', async () => {
        installService.storeFromPayload.mockResolvedValue({
            status: 'fail',
            channel: InstallChannel.OPEN,
            message: 'нет токенов',
        } as MarketplaceInstallResultDto);

        const result = await service.handleAppOpen({}, openQuery);

        expect(result.status).toBe('fail');
        const url = new URL(result.redirectUrl);
        expect(url.searchParams.get('status')).toBe('fail');
    });

    it('хук списков: отвечает ok без redirect', () => {
        const result = service.handleListHook('kpi-sync', openBody, openQuery);
        expect(result).toEqual({ status: 'ok', code: 'kpi-sync' });
        expect(installService.storeFromPayload).not.toHaveBeenCalled();
    });
});
