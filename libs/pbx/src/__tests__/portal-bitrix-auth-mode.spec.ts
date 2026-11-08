import { Logger } from '@nestjs/common';
import {
    EnumPortalAppCode,
    getPortalAppDefaults,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import {
    parseBitrixAuthMode,
    PortalBitrixAuthModeResolver,
} from '../lib/portal-bitrix-auth-mode.resolver';

/**
 * Режим авторизации бэкенда — из «Общих настроек портала». Любая
 * неопределённость (нет сервиса, сбой, чужое значение) = auto, то есть
 * прежнее поведение: порталы без вебхука (созданы установкой) не теряют
 * OAuth-путь. Действующие порталы закрепляет за вебхуком установка.
 */
describe('parseBitrixAuthMode', () => {
    it('известные значения проходят, остальное — auto', () => {
        expect(parseBitrixAuthMode('app')).toBe('app');
        expect(parseBitrixAuthMode('webhook')).toBe('webhook');
        expect(parseBitrixAuthMode('auto')).toBe('auto');
        expect(parseBitrixAuthMode('oauth')).toBe('auto');
        expect(parseBitrixAuthMode(undefined)).toBe('auto');
        expect(parseBitrixAuthMode(1)).toBe('auto');
    });
});

describe('PortalBitrixAuthModeResolver', () => {
    const logger = { warn: jest.fn() } as unknown as Logger;
    const defaults = getPortalAppDefaults(EnumPortalAppCode.portal);

    it('настройка читается раз в минуту, а не на каждый init', async () => {
        const resolve = jest
            .fn()
            .mockResolvedValue({ ...defaults, bitrixAuthMode: 'app' });
        const resolver = new PortalBitrixAuthModeResolver(
            { resolve } as unknown as PortalAppSettingsService,
            logger,
        );

        await resolver.resolve('a.bitrix24.ru');
        const second = await resolver.resolve('a.bitrix24.ru');

        expect(second).toBe('app');
        expect(resolve).toHaveBeenCalledTimes(1);
        expect(resolve).toHaveBeenCalledWith(
            'a.bitrix24.ru',
            EnumPortalAppCode.portal,
        );
    });

    it('у каждого домена свой режим', async () => {
        const resolve = jest.fn().mockImplementation((domain: string) =>
            Promise.resolve({
                ...defaults,
                bitrixAuthMode:
                    domain === 'new.bitrix24.ru' ? 'app' : 'webhook',
            }),
        );
        const resolver = new PortalBitrixAuthModeResolver(
            { resolve } as unknown as PortalAppSettingsService,
            logger,
        );

        expect(await resolver.resolve('new.bitrix24.ru')).toBe('app');
        expect(await resolver.resolve('old.bitrix24.ru')).toBe('webhook');
    });

    it('настройки не прочитались — auto (как раньше), init не падает', async () => {
        const resolver = new PortalBitrixAuthModeResolver(
            {
                resolve: jest.fn().mockRejectedValue(new Error('db down')),
            } as unknown as PortalAppSettingsService,
            logger,
        );

        await expect(resolver.resolve('a.bitrix24.ru')).resolves.toBe('auto');
    });

    it('без сервиса настроек — auto', async () => {
        const resolver = new PortalBitrixAuthModeResolver(undefined, logger);

        await expect(resolver.resolve('a.bitrix24.ru')).resolves.toBe('auto');
    });
});
