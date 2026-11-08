import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    MarketplaceTokenError,
    MarketplaceTokenErrorCode,
} from '../../domain/marketplace-token.errors';
import {
    ActiveInstall,
    MarketplaceAuthRepository,
} from '../../persistence/marketplace-auth.repository';
import { LocalAppKeysRepository } from '../../persistence/local-app-keys.repository';
import { MarketplaceAppSecretsResolver } from '../../refresh/marketplace-app-secrets.resolver';
import { MarketplaceTokenService } from '../../refresh/marketplace-token.service';
import { LocalAppConnectionService } from '../local-app-connection.service';

const PORTAL = { domain: 'Client.Bitrix24.ru', memberId: 'mid-1' };
const KEYS = {
    clientId: 'local.5f1a2b3c4d5e6.12345678',
    clientSecret: 'AbCdEf0123456789xyz',
};

function setup(env: Record<string, string> = {}) {
    const keys = {
        findKeysMeta: jest.fn().mockResolvedValue(null),
        saveKeys: jest.fn().mockResolvedValue(undefined),
        lastTokenEvent: jest.fn().mockResolvedValue(null),
    };
    const installs = { findActiveInstall: jest.fn().mockResolvedValue(null) };
    const tokens = { forceRefresh: jest.fn().mockResolvedValue(undefined) };
    const secrets = { forget: jest.fn() };
    const service = new LocalAppConnectionService(
        keys as unknown as LocalAppKeysRepository,
        installs as unknown as MarketplaceAuthRepository,
        tokens as unknown as MarketplaceTokenService,
        secrets as unknown as MarketplaceAppSecretsResolver,
        { get: (key: string) => env[key] } as unknown as ConfigService,
    );
    return { service, keys, installs, tokens, secrets };
}

describe('LocalAppConnectionService', () => {
    it('статус: адреса для Битрикс24, ключи и установка; домен нормализован', async () => {
        const { service, keys, installs } = setup({
            MARKETPLACE_API_PUBLIC_URL: 'https://api.example.ru/',
        });
        keys.findKeysMeta.mockResolvedValue({
            code: 'garant_local:mid:mid-1',
            clientId: KEYS.clientId,
            updatedAt: new Date('2026-11-08T10:00:00Z'),
        });
        installs.findActiveInstall.mockResolvedValue({
            install_status: 'installed',
            installed_at: new Date('2026-11-08T09:00:00Z'),
            expires_at: new Date('2026-11-08T11:00:00Z'),
        } as unknown as ActiveInstall);

        const status = await service.status(PORTAL);

        expect(status.domain).toBe('client.bitrix24.ru');
        expect(status.setup).toMatchObject({
            devSectionUrl:
                'https://client.bitrix24.ru/devops/section/standard/',
            handlerUrl: 'https://api.example.ru/api/bitrix-marketplace/app',
            installUrl: 'https://api.example.ru/api/bitrix-marketplace/install',
        });
        expect(status.setup.scopes).toContain('crm');
        expect(status.keys).toMatchObject({
            set: true,
            clientId: KEYS.clientId,
        });
        expect(status.install).toMatchObject({
            installed: true,
            status: 'installed',
        });
        expect(keys.findKeysMeta).toHaveBeenCalledWith([
            'garant_local:mid:mid-1',
            'garant_local:client.bitrix24.ru',
        ]);
        expect(installs.findActiveInstall).toHaveBeenCalledWith({
            memberId: 'mid-1',
        });
    });

    it('адрес API по умолчанию — api.pbx', async () => {
        const { service } = setup();
        const status = await service.status({
            domain: 'a.bitrix24.ru',
            memberId: null,
        });
        expect(status.setup.handlerUrl).toBe(
            'https://api.pbx.april-app.ru/api/bitrix-marketplace/app',
        );
    });

    it('сохранение: под member_id и доменом, кэш ключей сброшен', async () => {
        const { service, keys, secrets } = setup();
        await service.saveKeys(PORTAL, {
            clientId: ` ${KEYS.clientId} `,
            clientSecret: KEYS.clientSecret,
        });
        expect(keys.saveKeys).toHaveBeenCalledWith(
            ['garant_local:mid:mid-1', 'garant_local:client.bitrix24.ru'],
            KEYS.clientId,
            KEYS.clientSecret,
        );
        expect(secrets.forget).toHaveBeenCalledWith({
            memberId: 'mid-1',
            domain: 'client.bitrix24.ru',
        });
    });

    it('до установки member_id неизвестен — ключи только по домену', async () => {
        const { service, keys } = setup();
        await service.saveKeys(
            { domain: 'new.bitrix24.ru', memberId: null },
            KEYS,
        );
        expect(keys.saveKeys).toHaveBeenCalledWith(
            ['garant_local:new.bitrix24.ru'],
            KEYS.clientId,
            KEYS.clientSecret,
        );
    });

    it('чужие форматы ключей — понятная ошибка, ничего не сохраняется', async () => {
        const { service, keys } = setup();
        await expect(
            service.saveKeys(PORTAL, { ...KEYS, clientId: 'app.123' }),
        ).rejects.toThrow('local.xxxxxxxx.xxxxxxxx');
        await expect(
            service.saveKeys(PORTAL, { ...KEYS, clientSecret: 'a b' }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            service.saveKeys({ domain: null, memberId: null }, KEYS),
        ).rejects.toThrow('не указан домен');
        expect(keys.saveKeys).not.toHaveBeenCalled();
    });

    it.each([
        [MarketplaceTokenErrorCode.APP_KEYS_MISSING, 'no_keys'],
        [MarketplaceTokenErrorCode.APP_KEYS_INVALID, 'keys_invalid'],
        [MarketplaceTokenErrorCode.NO_INSTALL, 'not_installed'],
        [MarketplaceTokenErrorCode.REFRESH_INVALID, 'reopen_app'],
        [MarketplaceTokenErrorCode.OAUTH_UNAVAILABLE, 'unavailable'],
    ])('проверка: %s → %s', async (code, result) => {
        const { service, tokens } = setup();
        tokens.forceRefresh.mockRejectedValue(
            new MarketplaceTokenError(code, 'x'),
        );
        const check = await service.check(PORTAL);
        expect(check.result).toBe(result);
        expect(check.message.length).toBeGreaterThan(10);
    });

    it('проверка: ключи подошли', async () => {
        const { service, tokens } = setup();
        await expect(service.check(PORTAL)).resolves.toMatchObject({
            result: 'ok',
        });
        expect(tokens.forceRefresh).toHaveBeenCalledWith({ memberId: 'mid-1' });
    });
});
