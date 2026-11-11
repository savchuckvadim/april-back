import { ConfigService } from '@nestjs/config';
import { isTransientLlmError } from '@lib/llm-gateway/llm-error.util';
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

/** Клиент с настройками «из админки» (читатель над словарём, env пуст). */
function makeClientWithSettings(
    values: Record<string, string>,
): VibeCodeClient {
    const configService = {
        get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    return new VibeCodeClient(configService, {
        get: key => Promise.resolve(values[key] ?? null),
        getMany: keys =>
            Promise.resolve(
                Object.fromEntries(keys.map(key => [key, values[key] ?? null])),
            ),
    });
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

/** fetch отклоняется: сеть оборвалась или сработал таймаут сигнала. */
function mockFetchRejection(reason: unknown): void {
    const fetchMock = jest.fn().mockRejectedValue(reason);
    globalThis.fetch = fetchMock as unknown as typeof fetch;
}

/** Так AbortSignal.timeout отклоняет и fetch, и чтение тела ответа. */
function abortTimeout(): DOMException {
    return new DOMException(
        'The operation was aborted due to timeout',
        'TimeoutError',
    );
}

/** Вызов клиента с тестовой схемой и ключом. */
function completeBrief() {
    return makeClient().structuredCompletionWithUsage(
        'system',
        'user',
        'ai_brief',
        SCHEMA,
        API_KEY,
    );
}

/** С чем отклонился вызов — чтобы проверить саму ошибку, а не только текст. */
async function rejectionOf(call: Promise<unknown>): Promise<unknown> {
    try {
        await call;
    } catch (error: unknown) {
        return error;
    }
    throw new Error('Вызов не отклонился');
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

    /**
     * Таймаут VIBECODE_ANALYSIS_TIMEOUT_MS (по умолчанию 180 с): в журнале
     * шлюза видно, чей вызов и какой порог, а для шлюза ошибка по-прежнему
     * временная — предохранитель и переход к запасному поставщику.
     */
    it('таймаут fetch — ошибка с именем схемы и порогом, для шлюза временная', async () => {
        const timeout = abortTimeout();
        mockFetchRejection(timeout);

        const error = await rejectionOf(completeBrief());

        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe(
            'Vibecode ai_brief timeout after 180000 ms',
        );
        expect((error as Error).cause).toBe(timeout);
        expect(isTransientLlmError(error)).toBe(true);
    });

    it('таймаут при чтении тела ответа — та же ошибка: сигнал действует и на тело', async () => {
        const fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.reject(abortTimeout()),
            text: () => Promise.resolve(''),
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        await expect(completeBrief()).rejects.toThrow(
            'Vibecode ai_brief timeout after 180000 ms',
        );
    });

    /**
     * Срок ответа — «Настройки приложения» в админке (11.11.2026): читается
     * на каждом запросе, правка действует без перезапуска; выше 5 минут не
     * бывает — fetch Node сам рвёт ожидание заголовков.
     */
    it('срок ответа из настроек админки читается на каждом запросе; выше 300 000 — потолок', async () => {
        const values: Record<string, string> = {
            VIBECODE_ANALYSIS_TIMEOUT_MS: '300000',
        };
        const client = makeClientWithSettings(values);
        const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
        mockFetchRejection(abortTimeout());
        const call = () =>
            client.structuredCompletionWithUsage(
                'system',
                'user',
                'ai_brief',
                SCHEMA,
                API_KEY,
            );

        await expect(call()).rejects.toThrow(
            'Vibecode ai_brief timeout after 300000 ms',
        );
        expect(timeoutSpy).toHaveBeenLastCalledWith(300_000);

        values.VIBECODE_ANALYSIS_TIMEOUT_MS = '900000';
        await expect(call()).rejects.toThrow('timeout after 300000 ms');

        values.VIBECODE_ANALYSIS_TIMEOUT_MS = '240000';
        await expect(call()).rejects.toThrow('timeout after 240000 ms');
        expect(timeoutSpy).toHaveBeenLastCalledWith(240_000);
        timeoutSpy.mockRestore();
    });

    it('прочие сбои fetch пробрасываются как есть', async () => {
        const failure = new TypeError('fetch failed');
        mockFetchRejection(failure);

        await expect(completeBrief()).rejects.toBe(failure);
    });
});
