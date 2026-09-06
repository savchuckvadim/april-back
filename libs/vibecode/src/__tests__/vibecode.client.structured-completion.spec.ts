import { ConfigService } from '@nestjs/config';
import { VibeCodeClient } from '../vibecode.client';

const API_KEY = 'vibe-key';
const SCHEMA = {
    type: 'object',
    properties: { headline: { type: 'string' } },
    required: ['headline'],
    additionalProperties: false,
};

interface CompletionRequestBody {
    model: string;
    messages: { role: string; content: string }[];
    response_format: {
        type: string;
        json_schema: { name: string; strict: boolean; schema: unknown };
    };
}

function makeClient(): VibeCodeClient {
    const configService = {
        get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    return new VibeCodeClient(configService);
}

/** Подмена глобального fetch: клиент ходит в VibeCode напрямую, без HTTP-сервиса. */
function mockFetch(body: unknown, options?: { ok?: boolean; status?: number }) {
    const fetchMock = jest.fn().mockResolvedValue({
        ok: options?.ok ?? true,
        status: options?.status ?? 200,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
}

function requestBodyOf(fetchMock: jest.Mock): CompletionRequestBody {
    const call = fetchMock.mock.calls[0] as [string, { body: string }];
    return JSON.parse(call[1].body) as CompletionRequestBody;
}

function completionResponse(
    content: string,
    extra: Record<string, unknown> = {},
) {
    return { choices: [{ message: { content } }], ...extra };
}

describe('VibeCodeClient.structuredCompletionWithUsage', () => {
    const originalFetch = globalThis.fetch;
    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('отдаёт разобранный JSON, usage из OpenAI-совместимого ответа и модель', async () => {
        mockFetch(
            completionResponse('{"headline":"ок"}', {
                usage: {
                    prompt_tokens: 120,
                    completion_tokens: 30,
                    total_tokens: 150,
                },
                model: 'bitrix/bitrixgpt-5.5',
            }),
        );

        const response = await makeClient().structuredCompletionWithUsage(
            'system',
            'user',
            'ai_brief',
            SCHEMA,
            API_KEY,
        );

        expect(response).toEqual({
            result: { headline: 'ок' },
            usage: {
                promptTokens: 120,
                completionTokens: 30,
                totalTokens: 150,
            },
            model: 'bitrix/bitrixgpt-5.5',
        });
    });

    it('без usage и model в ответе — null-поля, а не нули (оценку по длине делает вызывающий)', async () => {
        mockFetch(completionResponse('{"headline":"ок"}'));

        const response = await makeClient().structuredCompletionWithUsage(
            'system',
            'user',
            'ai_brief',
            SCHEMA,
            API_KEY,
        );

        expect(response.usage).toEqual({
            promptTokens: null,
            completionTokens: null,
            totalTokens: null,
        });
        expect(response.model).toBeNull();
    });

    it('нечисловые значения usage считаются отсутствующими', async () => {
        mockFetch(
            completionResponse('{"headline":"ок"}', {
                usage: { prompt_tokens: '120', total_tokens: null },
            }),
        );

        const { usage } = await makeClient().structuredCompletionWithUsage(
            'system',
            'user',
            'ai_brief',
            SCHEMA,
            API_KEY,
        );

        expect(usage).toEqual({
            promptTokens: null,
            completionTokens: null,
            totalTokens: null,
        });
    });

    it('формирует strict json_schema запрос: системный/пользовательский промпт, имя схемы, модель из options', async () => {
        const fetchMock = mockFetch(completionResponse('{"headline":"ок"}'));

        await makeClient().structuredCompletionWithUsage(
            'system prompt',
            'user content',
            'ai_brief',
            SCHEMA,
            API_KEY,
            { model: 'bitrix/custom-model' },
        );

        const call = fetchMock.mock.calls[0] as [
            string,
            { headers: Record<string, string> },
        ];
        expect(call[0]).toBe(
            'https://vibecode.bitrix24.tech/v1/chat/completions',
        );
        expect(call[1].headers.Authorization).toBe(`Bearer ${API_KEY}`);
        const body = requestBodyOf(fetchMock);
        expect(body.model).toBe('bitrix/custom-model');
        expect(body.messages).toEqual([
            { role: 'system', content: 'system prompt' },
            { role: 'user', content: 'user content' },
        ]);
        expect(body.response_format).toEqual({
            type: 'json_schema',
            json_schema: { name: 'ai_brief', strict: true, schema: SCHEMA },
        });
    });

    it('structuredCompletion — тот же вызов, но наружу только разобранный результат (поведение не изменилось)', async () => {
        const fetchMock = mockFetch(
            completionResponse('{"headline":"ок"}', {
                usage: {
                    prompt_tokens: 1,
                    completion_tokens: 1,
                    total_tokens: 2,
                },
            }),
        );

        const result = await makeClient().structuredCompletion(
            'system',
            'user',
            'ai_brief',
            SCHEMA,
            API_KEY,
        );

        expect(result).toEqual({ headline: 'ок' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(requestBodyOf(fetchMock).model).toBe('bitrix/bitrixgpt-5.5');
    });

    it('пустой content — ошибка с именем схемы', async () => {
        mockFetch({ choices: [{ message: {} }] });

        await expect(
            makeClient().structuredCompletionWithUsage(
                'system',
                'user',
                'ai_brief',
                SCHEMA,
                API_KEY,
            ),
        ).rejects.toThrow('Empty ai_brief result from Vibecode');
    });

    it('HTTP-ошибка — исключение со статусом и телом ответа', async () => {
        mockFetch({ error: 'quota' }, { ok: false, status: 429 });

        await expect(
            makeClient().structuredCompletionWithUsage(
                'system',
                'user',
                'ai_brief',
                SCHEMA,
                API_KEY,
            ),
        ).rejects.toThrow('Vibecode ai_brief failed [429]');
    });
});
