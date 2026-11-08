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
import {
    EnumPortalAppCode,
    getPortalAppDefaults,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';

type FactoryMock = jest.Mocked<Pick<BitrixServiceFactory, 'create'>>;
type SettingsMock = jest.Mocked<
    Pick<PortalAppSettingsService, 'resolve' | 'resolveWithStored'>
>;
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
    let settings: SettingsMock;

    const bitrixInstance = { id: 'bitrix' };
    const portalModelInstance = { id: 'model' };
    const portalDefaults = getPortalAppDefaults(EnumPortalAppCode.portal);

    /** Режим авторизации бэкенда портала — настройка `bitrix_auth_mode`. */
    const setAuthMode = (mode: 'webhook' | 'app' | 'auto') =>
        settings.resolve.mockResolvedValue({
            ...portalDefaults,
            bitrixAuthMode: mode,
        });

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
            settings as unknown as PortalAppSettingsService,
        );

    beforeEach(() => {
        settings = {
            resolve: jest.fn().mockResolvedValue(portalDefaults),
            resolveWithStored: jest
                .fn()
                .mockResolvedValue({ values: portalDefaults, storedKeys: [] }),
        };
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

    it('режим app + активная установка: TOKEN-авторизация со свежим access, online-API не вызывается', async () => {
        setAuthMode('app');
        token.hasActiveInstall.mockResolvedValue(true);
        const service = build();

        const result = await service.init('mp.bitrix24.ru');

        expect(token.getFreshAccessToken).toHaveBeenCalledWith({
            domain: 'mp.bitrix24.ru',
        });
        expect(factory.create).toHaveBeenCalledWith(
            expect.objectContaining({
                domain: 'mp.bitrix24.ru',
                accessToken: 'fresh-access',
            }),
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
            expect.objectContaining({
                domain: 'legacy.bitrix24.ru',
                key: 'webhook-key',
            }),
            BxAuthType.HOOK,
        );
        expect(token.getFreshAccessToken).not.toHaveBeenCalled();
        expect(result.portal).toEqual(LEGACY_PORTAL);
        expect(result.PortalModel).toBe(portalModelInstance);
    });

    /*
     * Установка локального приложения на живой портал не должна уводить его
     * кроны и хуки с вебхука: установка закрепляет `bitrix_auth_mode=webhook`,
     * и OAuth-путь не включается даже при активной установке (решение
     * владельца 07.11.2026).
     */
    it('режим webhook при активной установке → HOOK-путь, установка даже не проверяется', async () => {
        setAuthMode('webhook');
        token.hasActiveInstall.mockResolvedValue(true);
        const service = build();

        await service.init('legacy.bitrix24.ru');

        expect(token.hasActiveInstall).not.toHaveBeenCalled();
        expect(token.getFreshAccessToken).not.toHaveBeenCalled();
        expect(factory.create).toHaveBeenCalledWith(
            expect.objectContaining({ key: 'webhook-key' }),
            BxAuthType.HOOK,
        );
    });

    /*
     * Порталы, созданные установкой до 07.11.2026 (april-dev), настройки не
     * имеют и вебхука тоже — умолчание `auto` сохраняет им прежний OAuth-путь.
     */
    it('режим не задан (auto) + активная установка → TOKEN, как было', async () => {
        token.hasActiveInstall.mockResolvedValue(true);
        const service = build();

        await service.init('mp.bitrix24.ru');

        expect(factory.create).toHaveBeenCalledWith(
            expect.objectContaining({ accessToken: 'fresh-access' }),
            BxAuthType.TOKEN,
        );
    });

    it('режим app без активной установки → HOOK-путь', async () => {
        setAuthMode('app');
        token.hasActiveInstall.mockResolvedValue(false);
        const service = build();

        await service.init('legacy.bitrix24.ru');

        expect(token.hasActiveInstall).toHaveBeenCalledWith(
            'legacy.bitrix24.ru',
        );
        expect(factory.create).toHaveBeenCalledWith(
            expect.objectContaining({ key: 'webhook-key' }),
            BxAuthType.HOOK,
        );
    });

    it('настройки портала не прочитались → как раньше (auto): без установки — HOOK', async () => {
        settings.resolve.mockRejectedValue(new Error('db down'));
        token.hasActiveInstall.mockResolvedValue(false);
        const service = build();

        await service.init('legacy.bitrix24.ru');

        expect(token.hasActiveInstall).toHaveBeenCalledWith(
            'legacy.bitrix24.ru',
        );
        expect(factory.create).toHaveBeenCalledWith(
            expect.objectContaining({ key: 'webhook-key' }),
            BxAuthType.HOOK,
        );
    });

    it('без MarketplaceCoreModule (Optional) — legacy-путь работает', async () => {
        setAuthMode('app');
        const service = build(false);

        await service.init('legacy.bitrix24.ru');

        expect(factory.create).toHaveBeenCalledWith(
            expect.objectContaining({
                domain: 'legacy.bitrix24.ru',
                key: 'webhook-key',
            }),
            BxAuthType.HOOK,
        );
    });

    it('предохранитель PBX_MARKETPLACE_AUTH_FIRST=false → legacy даже при режиме app и активной установке', async () => {
        process.env.PBX_MARKETPLACE_AUTH_FIRST = 'false';
        setAuthMode('app');
        token.hasActiveInstall.mockResolvedValue(true);
        const service = build();

        await service.init('mp.bitrix24.ru');

        expect(token.hasActiveInstall).not.toHaveBeenCalled();
        expect(factory.create).toHaveBeenCalledWith(
            expect.objectContaining({ key: 'webhook-key' }),
            BxAuthType.HOOK,
        );
    });

    it('initWebhook: вебхук из online-API даже при режиме app и активной установке', async () => {
        setAuthMode('app');
        token.hasActiveInstall.mockResolvedValue(true);
        const service = build();

        await service.initWebhook('mp.bitrix24.ru');

        expect(token.hasActiveInstall).not.toHaveBeenCalled();
        expect(token.getFreshAccessToken).not.toHaveBeenCalled();
        expect(factory.create).toHaveBeenCalledWith(
            expect.objectContaining({ key: 'webhook-key' }),
            BxAuthType.HOOK,
        );
    });

    it('сбой детекта (Redis/БД) → безопасный fallback на legacy', async () => {
        setAuthMode('app');
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
        // Каждый init получает свою копию локальной модели, не общий объект.
        expect(result.internalPortal).toEqual(INTERNAL_PORTAL);
        expect(result.internalPortal).not.toBe(INTERNAL_PORTAL);
        expect(result.portal).toEqual(LEGACY_PORTAL);
    });

    it('internalPortal: ошибка сборки не роняет init → internalPortal undefined', async () => {
        builder.buildByDomain.mockRejectedValue(new Error('no local portal'));
        const service = build();

        const result = await service.init('legacy.bitrix24.ru');

        expect(result.internalPortal).toBeUndefined();
        expect(result.portal).toEqual(LEGACY_PORTAL);
    });

    it('без PortalBuilderModule (Optional) — internalPortal undefined', async () => {
        const service = build(true, false);

        const result = await service.init('legacy.bitrix24.ru');

        expect(result.internalPortal).toBeUndefined();
    });

    /*
     * Внешний getportal отдаёт не все секции: на реальных порталах у него
     * бывает пустой lead, хотя поля лида установлены (pbx-install пишет их
     * в НАШУ БД). Без достройки потребитель считает поля неустановленными
     * и молча теряет записи — ни ошибки, ни данных.
     */
    it('внешний портал без полей лида → секция берётся из локальной сборки', async () => {
        const localLead = {
            bitrixfields: [{ code: 'op_lead_status', bitrixId: 'X' }],
        };
        builder.buildByDomain.mockResolvedValue({
            ...INTERNAL_PORTAL,
            lead: localLead,
        } as never);
        const service = build();

        const result = await service.init('legacy.bitrix24.ru');

        expect(result.portal.lead).toEqual(localLead);
        // Остальные поля внешнего портала не тронуты.
        expect(result.portal.key).toBe('webhook-key');
        expect(modelFactory.create).toHaveBeenCalledWith(result.portal);
    });

    it('внешний портал С полями лида — локальные данные НЕ перетирают его', async () => {
        const externalLead = {
            bitrixfields: [{ code: 'op_lead_status', bitrixId: 'EXTERNAL' }],
        };
        portalService.getPortalByDomain.mockResolvedValue({
            ...LEGACY_PORTAL,
            lead: externalLead,
        } as never);
        builder.buildByDomain.mockResolvedValue({
            ...INTERNAL_PORTAL,
            lead: { bitrixfields: [{ code: 'op_lead_status', bitrixId: 'X' }] },
        } as never);
        const service = build();

        const result = await service.init('legacy.bitrix24.ru');

        // Секция копируется, но содержимое — внешнее, не локальное.
        expect(result.portal.lead).toEqual(externalLead);
    });

    /*
     * Локальная сборка — около 19 SQL-запросов, а init зовётся 7–8 раз на
     * одно открытие сделки. Собранная модель живёт в памяти процесса
     * минуту (разбор нагрузки 05.10.2026).
     */
    describe('кэш локальной сборки портала', () => {
        it('второй init того же домена сборку из БД не повторяет', async () => {
            const service = build();

            await service.init('legacy.bitrix24.ru');
            const second = await service.init('legacy.bitrix24.ru');

            expect(builder.buildByDomain).toHaveBeenCalledTimes(1);
            expect(second.internalPortal).toEqual(INTERNAL_PORTAL);
        });

        it('параллельные init одного домена ждут одну сборку', async () => {
            const service = build();

            await Promise.all([
                service.init('legacy.bitrix24.ru'),
                service.init('legacy.bitrix24.ru'),
                service.init('legacy.bitrix24.ru'),
            ]);

            expect(builder.buildByDomain).toHaveBeenCalledTimes(1);
        });

        it('у каждого домена своя сборка', async () => {
            const service = build();

            await service.init('legacy.bitrix24.ru');
            await service.init('other.bitrix24.ru');

            expect(builder.buildByDomain).toHaveBeenCalledTimes(2);
        });

        it('правка модели одним потребителем не видна следующему', async () => {
            const service = build();

            const first = await service.init('legacy.bitrix24.ru');
            Object.assign(first.internalPortal ?? {}, { domain: 'испорчено' });
            const second = await service.init('legacy.bitrix24.ru');

            expect(second.internalPortal).toEqual(INTERNAL_PORTAL);
        });

        it('экземпляр Bitrix создаётся на каждый init — кэшируются только данные', async () => {
            const service = build();

            await service.init('legacy.bitrix24.ru');
            await service.init('legacy.bitrix24.ru');

            expect(factory.create).toHaveBeenCalledTimes(2);
        });

        it('неудачная сборка не запоминается — следующий init пробует снова', async () => {
            builder.buildByDomain
                .mockRejectedValueOnce(new Error('база недоступна'))
                .mockResolvedValueOnce(INTERNAL_PORTAL);
            const service = build();

            const first = await service.init('legacy.bitrix24.ru');
            const second = await service.init('legacy.bitrix24.ru');

            expect(first.internalPortal).toBeUndefined();
            expect(second.internalPortal).toEqual(INTERNAL_PORTAL);
        });

        it('initFresh перечитывает модель из БД мимо кэша', async () => {
            Object.assign(portalService, {
                refreshByDomain: jest.fn().mockResolvedValue(LEGACY_PORTAL),
            });
            const service = build();

            await service.init('legacy.bitrix24.ru');
            await service.initFresh('legacy.bitrix24.ru');

            expect(builder.buildByDomain).toHaveBeenCalledTimes(2);
        });
    });
});
