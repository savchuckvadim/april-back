import { Logger } from '@nestjs/common';
import {
    OpenAiCompatibleStructuredAdapter,
    buildChatCompletionBody,
    parseJsonContent,
} from '../adapters/openai-compatible-structured.adapter';
import type { LlmEndpoint } from '../llm-endpoint-resolver.service';

const ENDPOINT: LlmEndpoint = {
    baseUrl: 'https://llm.example/v1',
    apiKey: 'secret',
    model: 'Qwen/Qwen3-235B',
    source: 'env',
};

const REQUEST = {
    domain: 'test.bitrix24.ru',
    systemPrompt: 'система',
    userContent: 'текст',
    schemaName: 'call_focus_form',
    schema: { type: 'object', properties: { score: { type: 'number' } } },
};

const okResponse = (content: string, extra: Record<string, unknown> = {}) =>
    new Response(
        JSON.stringify({
            choices: [{ message: { content } }],
            usage: {
                prompt_tokens: 100,
                completion_tokens: 20,
                total_tokens: 120,
            },
            model: 'qwen-actual',
            ...extra,
        }),
        { status: 200 },
    );

/** Прокси выключен: fetch глобальный (его подменяют тесты), адрес как есть. */
const directEgress = {
    fetch: (url: string, init?: RequestInit) => fetch(url, init),
};

const makeAdapter = (
    values: Record<string, string> = {},
    endpoint: LlmEndpoint | null = ENDPOINT,
    egress: { fetch: typeof directEgress.fetch } = directEgress,
) => {
    const endpoints = { resolve: jest.fn().mockResolvedValue(endpoint) };
    const config = { get: (key: string) => values[key] };
    return {
        adapter: new OpenAiCompatibleStructuredAdapter(
            config as never,
            endpoints as never,
            egress as never,
        ),
        endpoints,
    };
};

describe('buildChatCompletionBody / parseJsonContent', () => {
    it('json_schema — строгая схема в response_format, промпт как есть', () => {
        const body = buildChatCompletionBody('m', REQUEST, 'json_schema');
        expect(body).toEqual({
            model: 'm',
            messages: [
                { role: 'system', content: 'система' },
                { role: 'user', content: 'текст' },
            ],
            response_format: {
                type: 'json_schema',
                json_schema: {
                    name: 'call_focus_form',
                    strict: true,
                    schema: REQUEST.schema,
                },
            },
        });
    });

    it('json_object — схема дописана в системный промпт', () => {
        const body = buildChatCompletionBody('m', REQUEST, 'json_object') as {
            messages: { content: string }[];
            response_format: unknown;
        };
        expect(body.response_format).toEqual({ type: 'json_object' });
        expect(body.messages[0].content).toContain('система');
        expect(body.messages[0].content).toContain('"score"');
    });

    it('обёртка ```json снимается, чистый JSON разбирается как есть', () => {
        expect(parseJsonContent('```json\n{"a":1}\n```')).toEqual({ a: 1 });
        expect(parseJsonContent('  {"a":2} ')).toEqual({ a: 2 });
        expect(() => parseJsonContent('не json')).toThrow();
    });
});

describe('OpenAiCompatibleStructuredAdapter', () => {
    let fetchMock: jest.Mock;

    beforeEach(() => {
        fetchMock = jest.fn();
        global.fetch = fetchMock as unknown as typeof fetch;
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    it('вызов: адрес endpoint + /chat/completions, Bearer-ключ, strict JSON, usage и фактическая модель в ответе', async () => {
        fetchMock.mockResolvedValueOnce(okResponse('{"score": 7}'));
        const { adapter } = makeAdapter();

        const response = await adapter.complete(REQUEST);

        expect(response).toEqual({
            result: { score: 7 },
            usage: {
                promptTokens: 100,
                completionTokens: 20,
                totalTokens: 120,
            },
            model: 'qwen-actual',
            provider: 'openai-compatible',
        });
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://llm.example/v1/chat/completions');
        expect(init.headers).toMatchObject({ Authorization: 'Bearer secret' });
        const body = JSON.parse(init.body as string) as {
            response_format: { type: string };
        };
        expect(body.response_format.type).toBe('json_schema');
    });

    it('LLM_FALLBACK_JSON_MODE=json_object — без strict-схемы, ответ в ```json разбирается', async () => {
        fetchMock.mockResolvedValueOnce(
            okResponse('```json\n{"score": 5}\n```'),
        );
        const { adapter } = makeAdapter({
            LLM_FALLBACK_JSON_MODE: 'json_object',
        });

        const response = await adapter.complete(REQUEST);

        expect(response.result).toEqual({ score: 5 });
        const body = JSON.parse(
            (fetchMock.mock.calls[0] as [string, RequestInit])[1]
                .body as string,
        ) as { response_format: { type: string } };
        expect(body.response_format.type).toBe('json_object');
    });

    it('endpoint без ключа — без заголовка Authorization', async () => {
        fetchMock.mockResolvedValueOnce(okResponse('{}'));
        const { adapter } = makeAdapter({}, { ...ENDPOINT, apiKey: null });
        await adapter.complete(REQUEST);
        const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
        expect(init.headers).not.toHaveProperty('Authorization');
    });

    it('не-200 — ошибка с кодом в скобках (шлюз по нему решает про предохранитель)', async () => {
        fetchMock.mockResolvedValueOnce(
            new Response('overloaded', {
                status: 503,
                statusText: 'Service Unavailable',
            }),
        );
        const { adapter } = makeAdapter();
        await expect(adapter.complete(REQUEST)).rejects.toThrow(
            'failed [503]: overloaded',
        );
    });

    it('пустой ответ модели и сетевой обрыв — понятные ошибки', async () => {
        fetchMock.mockResolvedValueOnce(okResponse(''));
        const { adapter } = makeAdapter();
        await expect(adapter.complete(REQUEST)).rejects.toThrow(
            'пустой ответ модели',
        );

        fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
        await expect(adapter.complete(REQUEST)).rejects.toThrow(
            'сеть или таймаут — fetch failed',
        );
    });

    it('endpoint не настроен — configurationIssue с подсказкой, complete падает без запроса', async () => {
        const { adapter } = makeAdapter({}, null);
        expect(await adapter.configurationIssue('x')).toContain(
            'LLM_FALLBACK_BASE_URL',
        );
        await expect(adapter.complete(REQUEST)).rejects.toThrow('не настроен');
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
