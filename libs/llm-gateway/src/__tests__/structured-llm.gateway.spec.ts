import { Logger } from '@nestjs/common';
import {
    DEFAULT_LLM_PROVIDER_ORDER,
    StructuredLlmGateway,
    resolveProviderOrder,
} from '../structured-llm.gateway';
import type {
    LlmProviderCode,
    StructuredLlmAdapter,
    StructuredLlmResponse,
} from '../structured-llm.types';

const DOMAIN = 'test.bitrix24.ru';

const responseOf = (provider: LlmProviderCode): StructuredLlmResponse => ({
    result: { ok: true, from: provider },
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    model: `${provider}-model`,
    provider,
});

type FakeAdapter = StructuredLlmAdapter & {
    configurationIssue: jest.Mock;
    complete: jest.Mock;
};

const fakeAdapter = (
    code: LlmProviderCode,
    over: { issue?: string | null; complete?: jest.Mock } = {},
): FakeAdapter => ({
    code,
    configurationIssue: jest.fn().mockResolvedValue(over.issue ?? null),
    complete: over.complete ?? jest.fn().mockResolvedValue(responseOf(code)),
});

const fakeBreaker = (open: Partial<Record<LlmProviderCode, boolean>> = {}) => ({
    isOpen: jest.fn((provider: LlmProviderCode) =>
        Promise.resolve(open[provider] ?? false),
    ),
    recordSuccess: jest.fn().mockResolvedValue(undefined),
    recordFailure: jest.fn().mockResolvedValue(undefined),
});

const makeGateway = (
    values: Record<string, string> = {},
    deps: {
        vibecode?: FakeAdapter;
        openai?: FakeAdapter;
        aiRag?: FakeAdapter;
        breaker?: ReturnType<typeof fakeBreaker>;
    } = {},
) => {
    const vibecode = deps.vibecode ?? fakeAdapter('vibecode');
    const openai = deps.openai ?? fakeAdapter('openai-compatible');
    const aiRag = deps.aiRag ?? fakeAdapter('ai-rag');
    const breaker = deps.breaker ?? fakeBreaker();
    const config = { get: (key: string) => values[key] };
    const gateway = new StructuredLlmGateway(
        config as never,
        breaker as never,
        vibecode as never,
        openai as never,
        aiRag as never,
    );
    return { gateway, vibecode, openai, aiRag, breaker };
};

const REQUEST = {
    domain: DOMAIN,
    systemPrompt: 'система',
    userContent: 'текст',
    schemaName: 'call_focus_form',
    schema: { type: 'object' },
};

describe('resolveProviderOrder', () => {
    it('пусто или мусор — порядок по умолчанию; свой порядок уважается, дубли и чужие коды отбрасываются', () => {
        expect(resolveProviderOrder(undefined)).toEqual(
            DEFAULT_LLM_PROVIDER_ORDER,
        );
        expect(resolveProviderOrder('gpt, ')).toEqual(
            DEFAULT_LLM_PROVIDER_ORDER,
        );
        expect(
            resolveProviderOrder(
                'openai-compatible, vibecode, openai-compatible',
            ),
        ).toEqual(['openai-compatible', 'vibecode']);
        expect(resolveProviderOrder('vibecode')).toEqual(['vibecode']);
    });
});

describe('StructuredLlmGateway — провайдеры по порядку с переходом при сбое', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });
    afterEach(() => jest.restoreAllMocks());

    it('основной ответил — запасной не трогаем, удача записана в предохранитель', async () => {
        const { gateway, vibecode, openai, breaker } = makeGateway();

        const response = await gateway.complete(REQUEST);

        expect(response.provider).toBe('vibecode');
        expect(vibecode.complete).toHaveBeenCalledWith(REQUEST);
        expect(openai.complete).not.toHaveBeenCalled();
        expect(breaker.recordSuccess).toHaveBeenCalledWith('vibecode');
        expect(gateway.order).toEqual(['vibecode', 'openai-compatible']);
    });

    it('временный сбой основного (502) — ответ запасного, сбой записан в предохранитель', async () => {
        const vibecode = fakeAdapter('vibecode', {
            complete: jest
                .fn()
                .mockRejectedValue(
                    new Error(
                        'Vibecode call_focus_form failed [502]: bad gateway',
                    ),
                ),
        });
        const { gateway, openai, breaker } = makeGateway({}, { vibecode });

        const response = await gateway.complete(REQUEST);

        expect(response.provider).toBe('openai-compatible');
        expect(openai.complete).toHaveBeenCalledTimes(1);
        expect(breaker.recordFailure).toHaveBeenCalledWith(
            'vibecode',
            expect.stringContaining('HTTP 502'),
        );
    });

    it('постоянная ошибка основного (401) — запасной пробуется, но предохранитель её не считает', async () => {
        const vibecode = fakeAdapter('vibecode', {
            complete: jest
                .fn()
                .mockRejectedValue(
                    new Error('Vibecode x failed [401]: bad key'),
                ),
        });
        const { gateway, breaker } = makeGateway({}, { vibecode });

        await expect(gateway.complete(REQUEST)).resolves.toMatchObject({
            provider: 'openai-compatible',
        });
        expect(breaker.recordFailure).not.toHaveBeenCalled();
    });

    it('запасной не настроен, основной упал — одна ошибка со всеми причинами', async () => {
        const vibecode = fakeAdapter('vibecode', {
            complete: jest
                .fn()
                .mockRejectedValue(new Error('Vibecode x failed [503]: down')),
        });
        const openai = fakeAdapter('openai-compatible', {
            issue: 'не настроен (LLM_FALLBACK_BASE_URL)',
        });
        const { gateway } = makeGateway({}, { vibecode, openai });

        const promise = gateway.complete(REQUEST);
        await expect(promise).rejects.toThrow(
            'LLM недоступна для call_focus_form',
        );
        await expect(promise).rejects.toThrow('vibecode — HTTP 503');
        await expect(promise).rejects.toThrow(
            'openai-compatible — не настроен',
        );
        expect(openai.complete).not.toHaveBeenCalled();
    });

    it('основной на паузе — сначала запасной; упал и он — пробуем основного как полуоткрытого', async () => {
        const openai = fakeAdapter('openai-compatible', {
            complete: jest.fn().mockRejectedValue(new Error('fetch failed')),
        });
        const { gateway, vibecode } = makeGateway(
            {},
            { openai, breaker: fakeBreaker({ vibecode: true }) },
        );

        const response = await gateway.complete(REQUEST);

        expect(response.provider).toBe('vibecode');
        expect(openai.complete).toHaveBeenCalledTimes(1);
        expect(vibecode.complete).toHaveBeenCalledTimes(1);
    });

    it('ai-rag — третий эшелон только по явному порядку: по умолчанию его не зовут', async () => {
        const vibecode = fakeAdapter('vibecode', {
            complete: jest
                .fn()
                .mockRejectedValue(new Error('x failed [503]: down')),
        });
        const openai = fakeAdapter('openai-compatible', {
            issue: 'не настроен',
        });

        const byDefault = makeGateway({}, { vibecode, openai });
        await expect(byDefault.gateway.complete(REQUEST)).rejects.toThrow(
            'LLM недоступна',
        );
        expect(byDefault.aiRag.complete).not.toHaveBeenCalled();

        const explicit = makeGateway(
            { LLM_PROVIDER_ORDER: 'vibecode,openai-compatible,ai-rag' },
            { vibecode, openai },
        );
        await expect(explicit.gateway.complete(REQUEST)).resolves.toMatchObject(
            {
                provider: 'ai-rag',
            },
        );
        expect(explicit.aiRag.complete).toHaveBeenCalledTimes(1);
    });

    it('LLM_PROVIDER_ORDER меняет основного без выкладки', async () => {
        const { gateway, vibecode, openai } = makeGateway({
            LLM_PROVIDER_ORDER: 'openai-compatible,vibecode',
        });

        const response = await gateway.complete(REQUEST);

        expect(response.provider).toBe('openai-compatible');
        expect(openai.complete).toHaveBeenCalledTimes(1);
        expect(vibecode.complete).not.toHaveBeenCalled();
    });

    it('позиционные сигнатуры как у VibeCodeClient: пятый аргумент — домен, опции — модель', async () => {
        const { gateway, vibecode } = makeGateway();

        const result = await gateway.structuredCompletion(
            'система',
            'текст',
            'call_classification',
            { type: 'object' },
            DOMAIN,
            { model: 'bitrix/custom' },
        );

        expect(result).toEqual({ ok: true, from: 'vibecode' });
        expect(vibecode.complete).toHaveBeenCalledWith({
            domain: DOMAIN,
            systemPrompt: 'система',
            userContent: 'текст',
            schemaName: 'call_classification',
            schema: { type: 'object' },
            model: 'bitrix/custom',
        });
    });
});
