import { Portal } from 'generated/prisma';
import { MarketplaceAuthRepository } from '@lib/marketplace-core';
import {
    EnumPortalAppCode,
    getPortalAppDefaults,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { MarketplaceLocalAppService } from '../services/marketplace-local-app.service';

type SettingsMock = jest.Mocked<
    Pick<PortalAppSettingsService, 'save' | 'resolveWithStored'>
>;
type AuthRepoMock = jest.Mocked<
    Pick<MarketplaceAuthRepository, 'copyLocalSecretToMemberId'>
>;

const PORTAL = { id: BigInt(42), domain: 'new.bitrix24.ru' } as Portal;
const DEFAULTS = getPortalAppDefaults(EnumPortalAppCode.portal);

/**
 * Правила локального приложения при установке: режим авторизации бэкенда
 * закрепляется, только если админ его не выбирал (новый портал — app,
 * действующий — webhook); креды по домену копируются под member_id.
 * Сбои не роняют установку.
 */
describe('MarketplaceLocalAppService.onPortalInstalled', () => {
    let service: MarketplaceLocalAppService;
    let settings: SettingsMock;
    let authRepo: AuthRepoMock;

    beforeEach(() => {
        settings = {
            save: jest.fn().mockResolvedValue({}),
            resolveWithStored: jest
                .fn()
                .mockResolvedValue({ values: DEFAULTS, storedKeys: [] }),
        };
        authRepo = {
            copyLocalSecretToMemberId: jest.fn().mockResolvedValue(true),
        };
        service = new MarketplaceLocalAppService(
            settings as unknown as PortalAppSettingsService,
            authRepo as unknown as MarketplaceAuthRepository,
        );
    });

    it('портал создан установкой → bitrix_auth_mode=app', async () => {
        await service.onPortalInstalled({
            portal: PORTAL,
            created: true,
            domain: 'new.bitrix24.ru',
            memberId: 'member-1',
        });

        expect(settings.save).toHaveBeenCalledWith(
            42,
            EnumPortalAppCode.portal,
            { bitrixAuthMode: 'app' },
        );
    });

    it('действующий портал (найден по домену) → закрепляется webhook', async () => {
        await service.onPortalInstalled({
            portal: PORTAL,
            created: false,
            domain: 'legacy.bitrix24.ru',
            memberId: 'member-1',
        });

        expect(settings.resolveWithStored).toHaveBeenCalledWith(
            'legacy.bitrix24.ru',
            EnumPortalAppCode.portal,
        );
        expect(settings.save).toHaveBeenCalledWith(
            42,
            EnumPortalAppCode.portal,
            { bitrixAuthMode: 'webhook' },
        );
    });

    it('выбор админа установка не перезаписывает', async () => {
        settings.resolveWithStored.mockResolvedValue({
            values: { ...DEFAULTS, bitrixAuthMode: 'app' },
            storedKeys: ['bitrixAuthMode'],
        });

        await service.onPortalInstalled({
            portal: PORTAL,
            created: false,
            domain: 'legacy.bitrix24.ru',
            memberId: 'member-1',
        });

        expect(settings.save).not.toHaveBeenCalled();
    });

    it('секрет локального приложения копируется под member_id', async () => {
        await service.onPortalInstalled({
            portal: PORTAL,
            created: false,
            domain: 'legacy.bitrix24.ru',
            memberId: 'member-1',
        });

        expect(authRepo.copyLocalSecretToMemberId).toHaveBeenCalledWith(
            'legacy.bitrix24.ru',
            'member-1',
        );
    });

    it('без member_id копировать некуда', async () => {
        await service.onPortalInstalled({
            portal: PORTAL,
            created: false,
            domain: 'legacy.bitrix24.ru',
        });

        expect(authRepo.copyLocalSecretToMemberId).not.toHaveBeenCalled();
    });

    it('сбои настроек и копирования не роняют установку', async () => {
        settings.resolveWithStored.mockRejectedValue(new Error('db down'));
        authRepo.copyLocalSecretToMemberId.mockRejectedValue(
            new Error('db down'),
        );

        await expect(
            service.onPortalInstalled({
                portal: PORTAL,
                created: true,
                domain: 'new.bitrix24.ru',
                memberId: 'member-1',
            }),
        ).resolves.toBeUndefined();
        expect(settings.save).not.toHaveBeenCalled();
    });
});
