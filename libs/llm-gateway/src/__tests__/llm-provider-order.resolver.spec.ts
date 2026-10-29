import { Logger } from '@nestjs/common';
import { AI_LLM_PROVIDER_CODES } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.types';
import { LlmProviderOrderResolver } from '../llm-provider-order.resolver';
import { normalizeProviderOrder } from '../llm-provider-order.util';
import { LLM_PROVIDER_CODES } from '../structured-llm.types';

const DOMAIN = 'test.bitrix24.ru';

const makeResolver = (
    values: Record<string, string> = {},
    portalOrder: unknown = null,
) => {
    const portalAiSettings = {
        getByDomain: jest
            .fn()
            .mockResolvedValue(
                portalOrder === null ? null : { llmProviderOrder: portalOrder },
            ),
    };
    const config = { get: (key: string) => values[key] };
    return {
        resolver: new LlmProviderOrderResolver(
            config as never,
            portalAiSettings as never,
        ),
        portalAiSettings,
    };
};

describe('коды провайдеров шлюза и настроек портала совпадают', () => {
    it('LLM_PROVIDER_CODES === AI_LLM_PROVIDER_CODES (дубль в portal-lib из-за направления зависимости)', () => {
        expect([...LLM_PROVIDER_CODES]).toEqual([...AI_LLM_PROVIDER_CODES]);
    });
});

describe('normalizeProviderOrder', () => {
    it('чистит мусор и дубли; пусто — null', () => {
        expect(
            normalizeProviderOrder([
                'ai-rag',
                ' vibecode ',
                'gpt',
                'ai-rag',
                7,
            ]),
        ).toEqual(['ai-rag', 'vibecode']);
        expect(normalizeProviderOrder([])).toBeNull();
        expect(normalizeProviderOrder(['gpt'])).toBeNull();
    });
});

describe('LlmProviderOrderResolver — порядок портала важнее общего', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });
    afterEach(() => jest.restoreAllMocks());

    it('без настроек портала — общий порядок из env (или по умолчанию)', async () => {
        const byDefault = makeResolver();
        expect(await byDefault.resolver.orderFor(DOMAIN)).toEqual([
            'vibecode',
            'openai-compatible',
        ]);

        const fromEnv = makeResolver({
            LLM_PROVIDER_ORDER: 'openai-compatible,vibecode,ai-rag',
        });
        expect(await fromEnv.resolver.orderFor(DOMAIN)).toEqual([
            'openai-compatible',
            'vibecode',
            'ai-rag',
        ]);
        expect(fromEnv.resolver.fallbackOrder).toEqual([
            'openai-compatible',
            'vibecode',
            'ai-rag',
        ]);
    });

    it('у портала свой порядок — он и действует; мусор в нём — общий порядок', async () => {
        const own = makeResolver({}, ['openai-compatible', 'vibecode']);
        expect(await own.resolver.orderFor(DOMAIN)).toEqual([
            'openai-compatible',
            'vibecode',
        ]);

        const garbage = makeResolver({}, ['gpt-5']);
        expect(await garbage.resolver.orderFor(DOMAIN)).toEqual([
            'vibecode',
            'openai-compatible',
        ]);
    });

    it('ошибка чтения настроек — общий порядок; кэш минуту, invalidate сбрасывает', async () => {
        const { resolver, portalAiSettings } = makeResolver({}, [
            'openai-compatible',
        ]);
        portalAiSettings.getByDomain.mockRejectedValueOnce(
            new Error('БД недоступна'),
        );
        expect(await resolver.orderFor(DOMAIN)).toEqual([
            'vibecode',
            'openai-compatible',
        ]);
        // Закэшировался общий порядок — до сброса портал не перечитывается.
        expect(await resolver.orderFor(DOMAIN)).toEqual([
            'vibecode',
            'openai-compatible',
        ]);
        expect(portalAiSettings.getByDomain).toHaveBeenCalledTimes(1);

        resolver.invalidate(DOMAIN);
        expect(await resolver.orderFor(DOMAIN)).toEqual(['openai-compatible']);
    });
});
