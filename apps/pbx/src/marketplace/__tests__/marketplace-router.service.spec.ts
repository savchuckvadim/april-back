import { ConfigService } from '@nestjs/config';
import { MarketplaceComponentStateRepository } from '@lib/marketplace-core';
import { MarketplaceRouterService } from '../services/marketplace-router.service';
import { MarketplaceInstallService } from '../services/marketplace-install.service';
import {
    MarketplaceSessionService,
    PortalSessionState,
} from '../services/marketplace-session.service';
import { MarketplaceInstallRepository } from '../persistence/marketplace-install.repository';
import { InstallChannel } from '../lib/parse-install-params.util';
import { MarketplaceInstallResultDto } from '../dto/marketplace-install.dto';

type RepoMock = jest.Mocked<
    Pick<
        MarketplaceInstallRepository,
        'findInstallByMemberId' | 'findInstallByDomain'
    >
>;
type ComponentStateMock = jest.Mocked<
    Pick<MarketplaceComponentStateRepository, 'findComponents'>
>;

/** Установка marketplace-портала для проверок readiness-гейта */
const marketplaceInstall = (over: Record<string, unknown> = {}) => ({
    id: 'install-uuid',
    uninstalled_at: null,
    portals: {
        id: BigInt(1),
        member_id: 'member-1',
        domain: 'portal.bitrix24.ru',
        source: 'marketplace',
        approval_status: 'approved',
    },
    ...over,
});

describe('MarketplaceRouterService', () => {
    let service: MarketplaceRouterService;
    let installService: jest.Mocked<
        Pick<MarketplaceInstallService, 'storeFromPayload'>
    >;
    let sessionService: jest.Mocked<
        Pick<MarketplaceSessionService, 'openSession'>
    >;
    let repo: RepoMock;
    let componentState: ComponentStateMock;

    const openBody = {
        AUTH_ID: 'at',
        REFRESH_ID: 'rt',
        AUTH_EXPIRES: '3600',
        member_id: 'member-1',
        PLACEMENT: 'DEFAULT',
        LANG: 'ru',
    };
    const openQuery = { DOMAIN: 'portal.bitrix24.ru' };

    const buildService = (configService?: ConfigService) =>
        new MarketplaceRouterService(
            installService as unknown as MarketplaceInstallService,
            sessionService as unknown as MarketplaceSessionService,
            configService ??
                ({
                    get: jest.fn().mockReturnValue(undefined),
                } as unknown as ConfigService),
            repo as unknown as MarketplaceInstallRepository,
            componentState as unknown as MarketplaceComponentStateRepository,
        );

    beforeEach(() => {
        installService = {
            storeFromPayload: jest.fn().mockResolvedValue({
                status: 'success',
                channel: InstallChannel.OPEN,
            } as MarketplaceInstallResultDto),
        };
        sessionService = {
            openSession: jest.fn().mockResolvedValue({
                ok: true,
                state: PortalSessionState.ACTIVE,
                code: 'one-time-code',
            }),
        };
        // По умолчанию — легаси-мир: marketplace-установки нет, гейт молчит
        repo = {
            findInstallByMemberId: jest.fn().mockResolvedValue(null),
            findInstallByDomain: jest.fn().mockResolvedValue(null),
        };
        componentState = {
            findComponents: jest.fn().mockResolvedValue([]),
        };

        service = buildService();
    });

    it('открытие приложения: токены + сессия; в query — state и code, БЕЗ member_id', async () => {
        const result = await service.handleAppOpen(openBody, openQuery);

        expect(installService.storeFromPayload).toHaveBeenCalledTimes(1);
        expect(sessionService.openSession).toHaveBeenCalledTimes(1);
        expect(result.status).toBe('success');
        expect(result.state).toBe(PortalSessionState.ACTIVE);

        const url = new URL(result.redirectUrl);
        expect(url.origin + url.pathname).toBe(
            'https://bitrix.april-app.ru/cabinet',
        );
        expect(url.searchParams.get('domain')).toBe('portal.bitrix24.ru');
        expect(url.searchParams.get('lang')).toBe('ru');
        expect(url.searchParams.get('status')).toBe('success');
        expect(url.searchParams.get('state')).toBe('active');
        expect(url.searchParams.get('code')).toBe('one-time-code');
        // сырой member_id кабинету больше не передаётся — контекст через exchange
        expect(url.searchParams.get('member_id')).toBeNull();
    });

    it('верификация не пройдена: state=unauthorized, без code, status=fail', async () => {
        sessionService.openSession.mockResolvedValue({
            ok: false,
            reason: 'rest_verify_failed',
        });

        const result = await service.handleAppOpen(openBody, openQuery);

        expect(result.status).toBe('fail');
        const url = new URL(result.redirectUrl);
        expect(url.searchParams.get('state')).toBe('unauthorized');
        expect(url.searchParams.get('reason')).toBe('rest_verify_failed');
        expect(url.searchParams.get('code')).toBeNull();
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
        const overridden = buildService(configService);

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

    describe('readiness-гейт виджетов (заглушка «не готово»)', () => {
        it('сущности продукта установлены (агрегат installed) → обычный redirect', async () => {
            repo.findInstallByMemberId.mockResolvedValue(
                marketplaceInstall() as never,
            );
            componentState.findComponents.mockResolvedValue([
                { component_code: '', status: 'installed' },
            ] as never);

            const result = await service.handlePlacementOpen(
                'event-sales',
                openBody,
                openQuery,
            );

            expect(result.stubHtml).toBeUndefined();
            expect(new URL(result.redirectUrl).origin).toBe(
                'https://front.april-app.ru',
            );
        });

        it('сущности НЕ установлены (идёт provisioning) → HTML-заглушка вместо redirect', async () => {
            repo.findInstallByMemberId.mockResolvedValue(
                marketplaceInstall() as never,
            );
            componentState.findComponents.mockResolvedValue([
                { component_code: '', status: 'installing', reason_code: null },
            ] as never);

            const result = await service.handlePlacementOpen(
                'event-sales',
                openBody,
                openQuery,
            );

            expect(result.stubHtml).toContain('Приложение пока не готово');
            expect(result.stubHtml).toContain('Идёт настройка портала');
            expect(result.redirectUrl).toBe('');
        });

        it('портал ждёт одобрения (awaiting_approval) → заглушка с текстом про одобрение', async () => {
            repo.findInstallByMemberId.mockResolvedValue(
                marketplaceInstall() as never,
            );
            componentState.findComponents.mockResolvedValue([
                {
                    component_code: '',
                    status: 'pending',
                    reason_code: 'awaiting_approval',
                },
            ] as never);

            const result = await service.handlePlacementOpen(
                'event-sales',
                openBody,
                openQuery,
            );

            expect(result.stubHtml).toContain('ожидает одобрения вендора');
        });

        it('blocked-портал → заглушка «доступ приостановлен»', async () => {
            repo.findInstallByMemberId.mockResolvedValue(
                marketplaceInstall({
                    portals: {
                        id: BigInt(1),
                        member_id: 'member-1',
                        domain: 'portal.bitrix24.ru',
                        source: 'marketplace',
                        approval_status: 'blocked',
                    },
                }) as never,
            );

            const result = await service.handlePlacementOpen(
                'event-sales',
                openBody,
                openQuery,
            );

            expect(result.stubHtml).toContain('Доступ приостановлен');
            expect(componentState.findComponents).not.toHaveBeenCalled();
        });

        it('ЛЕГАСИ-портал (approval_status NULL) → гейт пропускает без проверки компонентов', async () => {
            repo.findInstallByMemberId.mockResolvedValue(
                marketplaceInstall({
                    portals: {
                        id: BigInt(1),
                        member_id: 'member-1',
                        domain: 'portal.bitrix24.ru',
                        source: 'legacy',
                        approval_status: null,
                    },
                }) as never,
            );

            const result = await service.handlePlacementOpen(
                'event-sales',
                openBody,
                openQuery,
            );

            expect(result.stubHtml).toBeUndefined();
            expect(componentState.findComponents).not.toHaveBeenCalled();
        });

        it('нет marketplace-установки вовсе → гейт молчит (легаси-мир)', async () => {
            const result = await service.handlePlacementOpen(
                'event-sales',
                openBody,
                openQuery,
            );
            expect(result.stubHtml).toBeUndefined();
            expect(result.redirectUrl).toContain('front.april-app.ru');
        });
    });
});
