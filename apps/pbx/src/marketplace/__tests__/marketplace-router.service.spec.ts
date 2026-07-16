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
            'https://bitrix.april-app.ru/cabinet',
        );
        expect(url.searchParams.get('domain')).toBe('portal.bitrix24.ru');
        expect(url.searchParams.get('member_id')).toBe('member-1');
        expect(url.searchParams.get('lang')).toBe('ru');
        expect(url.searchParams.get('status')).toBe('success');
    });

    it('открытие виджета: redirect на frontUrl виджета из эталона (свой домен) + PLACEMENT_OPTIONS', async () => {
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
        // цель — frontUrl виджета из манифеста, НЕ домен кабинета
        expect(url.origin + url.pathname).toBe(
            'https://front.april-app.ru/event/prod/placement.php',
        );
        expect(url.searchParams.get('placement_options')).toBe('{"ID":"1"}');
        expect(url.searchParams.get('domain')).toBe('portal.bitrix24.ru');
        expect(result.placement).toBe('CRM_DEAL_DETAIL_TAB');
    });

    it('env-подмена frontUrl: MARKETPLACE_WIDGET_URL_<КОД> приоритетнее манифеста', async () => {
        const configService = {
            get: jest.fn((key: string) =>
                key === 'MARKETPLACE_WIDGET_URL_EVENT_SALES'
                    ? 'https://new-front.example.com/events'
                    : undefined,
            ),
        } as unknown as ConfigService;
        const overridden = new MarketplaceRouterService(
            installService as unknown as MarketplaceInstallService,
            configService,
        );

        const result = await overridden.handlePlacementOpen(
            'event-sales',
            openBody,
            openQuery,
        );

        const url = new URL(result.redirectUrl);
        expect(url.origin + url.pathname).toBe(
            'https://new-front.example.com/events',
        );
    });

    it('report-sales редиректит на свой домен (next.april-app.ru)', async () => {
        const result = await service.handlePlacementOpen(
            'report-sales',
            openBody,
            openQuery,
        );
        const url = new URL(result.redirectUrl);
        expect(url.origin + url.pathname).toBe(
            'https://next.april-app.ru/kpi-sales/report',
        );
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
            'https://bitrix.april-app.ru/cabinet',
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
