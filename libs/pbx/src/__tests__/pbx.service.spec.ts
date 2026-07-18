import { PBXService } from '../pbx.service';
import { PortalService } from '@lib/portal-lib/portal/portal.service';
import { PortalModelFactory } from '@lib/portal-lib/portal/factory/potal-model.factory';
import { BackendPortalBuilderService } from '@lib/portal-lib/builder';
import { IPortal } from '@lib/portal-lib/portal/interfaces/portal.interface';
import {
    MarketplaceAuthRepository,
    MarketplaceTokenService,
} from '@lib/marketplace-core';
import {
    BitrixServiceFactory,
    BxAuthType,
} from '@/modules/bitrix/bitrix-service.factory';

type FactoryMock = jest.Mocked<Pick<BitrixServiceFactory, 'create'>>;
type PortalServiceMock = jest.Mocked<
    Pick<PortalService, 'getPortalByDomain' | 'getModelByDomain'>
>;
type TokenMock = jest.Mocked<
    Pick<MarketplaceTokenService, 'hasActiveInstall' | 'getFreshAccessToken'>
>;
type AuthRepoMock = jest.Mocked<
    Pick<MarketplaceAuthRepository, 'findActiveInstall'>
>;
type BuilderMock = jest.Mocked<
    Pick<BackendPortalBuilderService, 'buildByDomain'>
>;

const INTERNAL_PORTAL = { domain: 'legacy.bitrix24.ru' } as IPortal;

const LEGACY_PORTAL = {
    domain: 'legacy.bitrix24.ru',
    key: 'webhook-key',
    apiKey: '',
    C_REST_WEB_HOOK_URL: 'rest/1/webhook-key',
    C_REST_CLIENT_SECRET: '',
    C_REST_CLIENT_ID: '',
    deals: [],
    measures: [],
};

describe('PBXService.init (marketplace-ветка vs legacy)', () => {
    let factory: FactoryMock;
    let portalService: PortalServiceMock;
    let modelFactory: jest.Mocked<Pick<PortalModelFactory, 'create'>>;
    let token: TokenMock;
    let authRepo: AuthRepoMock;
    let builder: BuilderMock;

    const bitrixInstance = { id: 'bitrix' };
    const portalModelInstance = { id: 'model' };

    const build = (withMarketplace = true, withBuilder = true) =>
        new PBXService(
            factory as unknown as BitrixServiceFactory,
            portalService as unknown as PortalService,
            modelFactory as unknown as PortalModelFactory,
            withMarketplace
                ? (token as unknown as MarketplaceTokenService)
                : undefined,
            withMarketplace
                ? (authRepo as unknown as MarketplaceAuthRepository)
                : undefined,
            withBuilder
                ? (builder as unknown as BackendPortalBuilderService)
                : undefined,
        );

    beforeEach(() => {
        factory = {
            create: jest.fn().mockResolvedValue(bitrixInstance),
        };
        portalService = {
            getPortalByDomain: jest.fn().mockResolvedValue(LEGACY_PORTAL),
            getModelByDomain: jest.fn().mockResolvedValue(portalModelInstance),
        };
        modelFactory = {
            create: jest.fn().mockReturnValue(portalModelInstance),
        };
        token = {
            hasActiveInstall: jest.fn().mockResolvedValue(false),
            getFreshAccessToken: jest.fn().mockResolvedValue('fresh-access'),
        };
        authRepo = {
            findActiveInstall: jest.fn().mockResolvedValue({
                id: 'install-uuid',
                portals: { id: BigInt(7), domain: 'mp.bitrix24.ru' },
            } as never),
        };
        builder = {
            buildByDomain: jest.fn().mockResolvedValue(INTERNAL_PORTAL),
        };
        delete process.env.PBX_MARKETPLACE_AUTH_FIRST;
    });

    it('marketplace-домен: TOKEN-авторизация со свежим access, online-API не вызывается', async () => {
        token.hasActiveInstall.mockResolvedValue(true);
        const service = build();

        const result = await service.init('mp.bitrix24.ru');

        expect(token.getFreshAccessToken).toHaveBeenCalledWith({
            domain: 'mp.bitrix24.ru',
        });
        expect(factory.create).toHaveBeenCalledWith(
            { domain: 'mp.bitrix24.ru', accessToken: 'fresh-access' },
            BxAuthType.TOKEN,
        );
        expect(portalService.getPortalByDomain).not.toHaveBeenCalled();
        expect(result.bitrix).toBe(bitrixInstance);
        // портал синтезирован: id из локальной portals, вебхук-полей нет
        expect(result.portal.id).toBe(7);
        expect(result.portal.key).toBe('');
        expect(modelFactory.create).toHaveBeenCalledWith(result.portal);
    });

    it('legacy-домен: прежний HOOK-путь через online-API', async () => {
        const service = build();

        const result = await service.init('legacy.bitrix24.ru');

        expect(factory.create).toHaveBeenCalledWith(
            { domain: 'legacy.bitrix24.ru', key: 'webhook-key' },
            BxAuthType.HOOK,
        );
        expect(token.getFreshAccessToken).not.toHaveBeenCalled();
        expect(result.portal).toBe(LEGACY_PORTAL);
        expect(result.PortalModel).toBe(portalModelInstance);
    });

    it('без MarketplaceCoreModule (Optional) — legacy-путь работает', async () => {
        const service = build(false);

        await service.init('legacy.bitrix24.ru');

        expect(factory.create).toHaveBeenCalledWith(
            { domain: 'legacy.bitrix24.ru', key: 'webhook-key' },
            BxAuthType.HOOK,
        );
    });

    it('предохранитель PBX_MARKETPLACE_AUTH_FIRST=false → legacy даже при активной установке', async () => {
        process.env.PBX_MARKETPLACE_AUTH_FIRST = 'false';
        token.hasActiveInstall.mockResolvedValue(true);
        const service = build();

        await service.init('mp.bitrix24.ru');

        expect(token.hasActiveInstall).not.toHaveBeenCalled();
        expect(factory.create).toHaveBeenCalledWith(
            expect.objectContaining({ key: 'webhook-key' }),
            BxAuthType.HOOK,
        );
    });

    it('сбой детекта (Redis/БД) → безопасный fallback на legacy', async () => {
        token.hasActiveInstall.mockRejectedValue(new Error('redis down'));
        const service = build();

        await service.init('legacy.bitrix24.ru');

        expect(factory.create).toHaveBeenCalledWith(
            expect.objectContaining({ key: 'webhook-key' }),
            BxAuthType.HOOK,
        );
    });

    it('internalPortal: локальная модель из БД отдаётся рядом с внешним порталом', async () => {
        const service = build();

        const result = await service.init('legacy.bitrix24.ru');

        expect(builder.buildByDomain).toHaveBeenCalledWith(
            'legacy.bitrix24.ru',
        );
        expect(result.internalPortal).toBe(INTERNAL_PORTAL);
        expect(result.portal).toBe(LEGACY_PORTAL);
    });

    it('internalPortal: ошибка сборки не роняет init → internalPortal undefined', async () => {
        builder.buildByDomain.mockRejectedValue(new Error('no local portal'));
        const service = build();

        const result = await service.init('legacy.bitrix24.ru');

        expect(result.internalPortal).toBeUndefined();
        expect(result.portal).toBe(LEGACY_PORTAL);
    });

    it('без PortalBuilderModule (Optional) — internalPortal undefined', async () => {
        const service = build(true, false);

        const result = await service.init('legacy.bitrix24.ru');

        expect(result.internalPortal).toBeUndefined();
    });
});
