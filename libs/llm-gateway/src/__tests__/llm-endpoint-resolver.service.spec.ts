import { Logger } from '@nestjs/common';
import {
    LlmEndpointResolverService,
    endpointOf,
} from '../llm-endpoint-resolver.service';

const DOMAIN = 'test.bitrix24.ru';

const makeResolver = (
    values: Record<string, string> = {},
    keys: Record<string, string | null> = {},
    portalFound = true,
) => {
    const portalStore = {
        getPortalByDomain: jest
            .fn()
            .mockResolvedValue(portalFound ? { id: 7 } : null),
    };
    const portalKeys = {
        get: jest.fn((_id: number, key: string) =>
            Promise.resolve(keys[key] ?? null),
        ),
    };
    const config = { get: (key: string) => values[key] };
    return {
        resolver: new LlmEndpointResolverService(
            config as never,
            portalStore as never,
            portalKeys as never,
        ),
        portalStore,
        portalKeys,
    };
};

describe('endpointOf', () => {
    it('нужны адрес и модель; ключ необязателен; хвостовые слэши снимаются', () => {
        expect(endpointOf('https://a/v1/', ' k ', 'm', 'env')).toEqual({
            baseUrl: 'https://a/v1',
            apiKey: 'k',
            model: 'm',
            source: 'env',
        });
        expect(
            endpointOf('https://a/v1', '', 'm', 'portal')?.apiKey,
        ).toBeNull();
        expect(endpointOf('', 'k', 'm', 'env')).toBeNull();
        expect(endpointOf('https://a', 'k', '  ', 'env')).toBeNull();
    });
});

describe('LlmEndpointResolverService', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });
    afterEach(() => jest.restoreAllMocks());

    it('свои креды портала важнее общего env', async () => {
        const { resolver } = makeResolver(
            {
                LLM_FALLBACK_BASE_URL: 'https://env/v1',
                LLM_FALLBACK_MODEL: 'env-model',
            },
            {
                llmBaseUrl: 'https://portal/v1',
                llmKey: 'portal-key',
                llmModelName: 'portal-model',
            },
        );
        expect(await resolver.resolve(DOMAIN)).toEqual({
            baseUrl: 'https://portal/v1',
            apiKey: 'portal-key',
            model: 'portal-model',
            source: 'portal',
        });
    });

    it('у портала кредов нет — общий env; нет и его — null', async () => {
        const withEnv = makeResolver({
            LLM_FALLBACK_BASE_URL: 'https://env/v1',
            LLM_FALLBACK_API_KEY: 'env-key',
            LLM_FALLBACK_MODEL: 'env-model',
        });
        expect(await withEnv.resolver.resolve(DOMAIN)).toMatchObject({
            source: 'env',
            model: 'env-model',
        });

        const bare = makeResolver();
        expect(await bare.resolver.resolve(DOMAIN)).toBeNull();
    });

    it('Cloud.ru контура 1 уже настроен (CLOUDRU_API_KEY) — он же запасной endpoint без LLM_FALLBACK_*', async () => {
        const { resolver } = makeResolver({ CLOUDRU_API_KEY: 'cloud-key' });
        expect(await resolver.resolve(DOMAIN)).toEqual({
            baseUrl: 'https://foundation-models.api.cloud.ru/v1',
            apiKey: 'cloud-key',
            model: 'Qwen/Qwen3-235B-A22B-Instruct-2507',
            source: 'env',
        });

        const custom = makeResolver({
            CLOUDRU_API_KEY: 'k',
            CLOUDRU_BASE_URL: 'https://own/v1/',
            CLOUDRU_MODEL: 'Qwen/Qwen3-32B',
        });
        expect(await custom.resolver.resolve(DOMAIN)).toMatchObject({
            baseUrl: 'https://own/v1',
            model: 'Qwen/Qwen3-32B',
        });
    });

    it('ошибка чтения кредов портала не роняет вызов — берётся env', async () => {
        const { resolver, portalStore } = makeResolver({
            LLM_FALLBACK_BASE_URL: 'https://env/v1',
            LLM_FALLBACK_MODEL: 'env-model',
        });
        portalStore.getPortalByDomain.mockRejectedValueOnce(
            new Error('БД недоступна'),
        );
        expect(await resolver.resolve(DOMAIN)).toMatchObject({ source: 'env' });
    });

    it('кэш минуту: повторный вызов БД не трогает, invalidate сбрасывает', async () => {
        const { resolver, portalStore } = makeResolver();
        await resolver.resolve(DOMAIN);
        await resolver.resolve(DOMAIN);
        expect(portalStore.getPortalByDomain).toHaveBeenCalledTimes(1);
        resolver.invalidate(DOMAIN);
        await resolver.resolve(DOMAIN);
        expect(portalStore.getPortalByDomain).toHaveBeenCalledTimes(2);
    });
});
