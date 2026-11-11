import { Logger } from '@nestjs/common';
import { isTransientLlmError } from '../llm-error.util';
import { LlmUnavailableError } from '../llm-unavailable.error';
import {
    DEFAULT_LLM_PROVIDER_ORDER,
    StructuredLlmGateway,
    resolveProviderOrder,
} from '../structured-llm.gateway';
import type {
    LlmProviderCode,
    LlmSendGuard,
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
    /** Запрос «ушёл» к модели — после проверки шлюза у отправки. */
    sent: jest.Mock;
};

/**
 * Адаптер как настоящий: у самой отправки зовёт проверку шлюза (пауза,
 * замок пробы) и только потом «отправляет» запрос — `sent`.
 */
const fakeAdapter = (
    code: LlmProviderCode,
    over: { issue?: string | null; complete?: jest.Mock } = {},
): FakeAdapter => {
    const sent = jest.fn();
    return {
        code,
        configurationIssue: jest.fn().mockResolvedValue(over.issue ?? null),
        complete:
            over.complete ??
            jest.fn(async (_request: unknown, guard?: LlmSendGuard) => {
                await guard?.beforeSend();
                sent();
                return responseOf(code);
            }),
        sent,
    };
};

/** Пауза — по `open` (можно менять по ходу теста); проба свободна, если не сказано иное. */
const fakeBreaker = (
    open: Partial<Record<LlmProviderCode, boolean>> = {},
    probeFree = true,
) => ({
    isOpen: jest.fn((provider: LlmProviderCode) =>
        Promise.resolve(open[provider] ?? false),
    ),
    recordSuccess: jest.fn().mockResolvedValue(undefined),
    recordFailure: jest.fn().mockResolvedValue(undefined),
    tryStartProbe: jest.fn().mockResolvedValue(probeFree),
    endProbe: jest.fn().mockResolvedValue(undefined),
    claimPausedAlert: jest.fn().mockResolvedValue(true),
});

/** Порядок: общий из env, у портала — свой (как отдаёт LlmProviderOrderResolver). */
const fakeOrderResolver = (
    values: Record<string, string>,
    portalOrder?: LlmProviderCode[],
) => {
    const fallbackOrder = resolveProviderOrder(values.LLM_PROVIDER_ORDER);
    return {
        fallbackOrder,
        orderFor: jest.fn().mockResolvedValue(portalOrder ?? fallbackOrder),
        invalidate: jest.fn(),
    };
};

const makeGateway = (
    values: Record<string, string> = {},
    deps: {
        vibecode?: FakeAdapter;
        openai?: FakeAdapter;
        aiRag?: FakeAdapter;
        breaker?: ReturnType<typeof fakeBreaker>;
        portalOrder?: LlmProviderCode[];
    } = {},
) => {
    const vibecode = deps.vibecode ?? fakeAdapter('vibecode');
    const openai = deps.openai ?? fakeAdapter('openai-compatible');
    const aiRag = deps.aiRag ?? fakeAdapter('ai-rag');
    const breaker = deps.breaker ?? fakeBreaker();
    const orderResolver = fakeOrderResolver(values, deps.portalOrder);
    const gateway = new StructuredLlmGateway(
        orderResolver as never,
        breaker as never,
        vibecode as never,
        openai as never,
        aiRag as never,
    );
    return { gateway, vibecode, openai, aiRag, breaker, orderResolver };
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
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    it('основной ответил — запасной не трогаем, удача записана в предохранитель', async () => {
        const { gateway, vibecode, openai, breaker } = makeGateway();

        const response = await gateway.complete(REQUEST);

        expect(response.provider).toBe('vibecode');
        // Обычная попытка — с проверкой паузы перед отправкой.
        expect(vibecode.complete).toHaveBeenCalledWith(REQUEST, {
            beforeSend: expect.any(Function) as unknown,
        });
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
            expect.any(Number),
            true,
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
        // К не настроенному шлюз не обращался — в сорвавшихся его нет.
        await expect(promise).rejects.toMatchObject({
            failures: [{ provider: 'vibecode', transient: true }],
        });
        expect(openai.complete).not.toHaveBeenCalled();
    });

    /** Решение владельца 08.11.2026: тревога — когда отказали все. */
    it('отказали все поставщики — тревога «ПОПЫТКИ ИСЧЕРПАНЫ» в телеграм', async () => {
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        const vibecode = fakeAdapter('vibecode', {
            complete: jest
                .fn()
                .mockRejectedValue(new Error('Vibecode x failed [503]: down')),
        });
        const openai = fakeAdapter('openai-compatible', {
            issue: 'не настроен',
        });
        const { gateway } = makeGateway({}, { vibecode, openai });

        await expect(gateway.complete(REQUEST)).rejects.toThrow(
            'LLM недоступна',
        );
        expect(error).toHaveBeenCalledWith(
            expect.stringContaining('ПОПЫТКИ ИСЧЕРПАНЫ'),
            { telegram: true },
        );
        error.mockRestore();
    });

    /**
     * Фокус-разбор звонка по сводной ошибке решает, звать ли цельную
     * страховку (11.11.2026): нужен признак временного сбоя по каждому
     * поставщику, а не текст.
     */
    it('отказали все — LlmUnavailableError: прежний текст и сорвавшиеся вызовы по порядку попыток', async () => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation(
            () => undefined,
        );
        const vibecode = fakeAdapter('vibecode', {
            complete: jest
                .fn()
                .mockRejectedValue(
                    new Error(
                        'Vibecode call_focus_form timeout after 180000 ms',
                    ),
                ),
        });
        const openai = fakeAdapter('openai-compatible', {
            complete: jest
                .fn()
                .mockRejectedValue(
                    new Error(
                        'LLM (groq) call_focus_form failed [413]: Request too large',
                    ),
                ),
        });
        const { gateway } = makeGateway({}, { vibecode, openai });

        const promise = gateway.complete(REQUEST);
        await expect(promise).rejects.toBeInstanceOf(LlmUnavailableError);
        await expect(promise).rejects.toThrow(
            'LLM недоступна для call_focus_form (test.bitrix24.ru): vibecode — Vibecode call_focus_form timeout',
        );
        await expect(promise).rejects.toMatchObject({
            failures: [
                { provider: 'vibecode', transient: true },
                { provider: 'openai-compatible', transient: false },
            ],
            primary: 'vibecode',
        });
        // Временная, хотя первым кодом в тексте стоит 413 запасного.
        const error: unknown = await promise.catch((reason: unknown) => reason);
        expect(isTransientLlmError(error)).toBe(true);
    });

    /**
     * Находка ревью 11.11.2026: «хоть один временный» превращал 429
     * бесплатного Groq в сбой поставщика, хотя VibeCode ответил негодным
     * JSON, — и конвейер не звал цельную страховку, которая могла пройти.
     */
    it('отказали все — временный ли отказ решает основной: негодный ответ VibeCode + 429 Groq — не временный', async () => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation(
            () => undefined,
        );
        const vibecode = fakeAdapter('vibecode', {
            complete: jest
                .fn()
                .mockRejectedValue(new Error('Unexpected end of JSON input')),
        });
        const openai = fakeAdapter('openai-compatible', {
            complete: jest
                .fn()
                .mockRejectedValue(
                    new Error(
                        'LLM (groq) call_focus_form failed [429]: rate limit',
                    ),
                ),
        });
        const { gateway } = makeGateway({}, { vibecode, openai });

        const error: unknown = await gateway
            .complete(REQUEST)
            .catch((reason: unknown) => reason);

        expect(error).toMatchObject({
            primary: 'vibecode',
            failures: [
                { provider: 'vibecode', transient: false },
                { provider: 'openai-compatible', transient: true },
            ],
        });
        expect(isTransientLlmError(error)).toBe(false);
    });

    it('основной не настроен — основным считается первый настроенный', async () => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation(
            () => undefined,
        );
        const vibecode = fakeAdapter('vibecode', {
            issue: 'VibeCode-ключ не заведён',
        });
        const openai = fakeAdapter('openai-compatible', {
            complete: jest.fn().mockRejectedValue(new Error('fetch failed')),
        });
        const { gateway } = makeGateway({}, { vibecode, openai });

        const error: unknown = await gateway
            .complete(REQUEST)
            .catch((reason: unknown) => reason);

        expect(error).toMatchObject({ primary: 'openai-compatible' });
        expect(isTransientLlmError(error)).toBe(true);
    });

    it('основной на паузе — сначала запасной; упал и он — пробуем основного как полуоткрытого', async () => {
        const openai = fakeAdapter('openai-compatible', {
            complete: jest.fn().mockRejectedValue(new Error('fetch failed')),
        });
        const breaker = fakeBreaker({ vibecode: true });
        const { gateway, vibecode } = makeGateway({}, { openai, breaker });

        const response = await gateway.complete(REQUEST);

        expect(response.provider).toBe('vibecode');
        expect(openai.complete).toHaveBeenCalledTimes(1);
        expect(vibecode.sent).toHaveBeenCalledTimes(1);
        // Замок пробы берётся у самой отправки и снимается своим маркером.
        expect(breaker.tryStartProbe).toHaveBeenCalledWith(
            'vibecode',
            expect.any(String),
        );
        const [, token] = breaker.tryStartProbe.mock.calls[0] as [
            string,
            string,
        ];
        expect(breaker.endProbe).toHaveBeenCalledWith('vibecode', token);
    });

    /**
     * Ревью 11.11.2026: список «на паузе» собирался в начале вызова — если
     * пауза кончилась, пока ждали запасного, вызов всё равно бился за замок
     * пробы и мог получить «проба уже идёт».
     */
    it('пауза кончилась, пока ждали запасного, — к основному обычный запрос, без замка пробы', async () => {
        const open: Partial<Record<LlmProviderCode, boolean>> = {
            vibecode: true,
        };
        const breaker = fakeBreaker(open);
        const openai = fakeAdapter('openai-compatible', {
            complete: jest.fn(() => {
                open.vibecode = false;
                return Promise.reject(new Error('fetch failed'));
            }),
        });
        const { gateway, vibecode } = makeGateway({}, { openai, breaker });

        const response = await gateway.complete(REQUEST);

        expect(response.provider).toBe('vibecode');
        expect(vibecode.sent).toHaveBeenCalledTimes(1);
        expect(breaker.tryStartProbe).not.toHaveBeenCalled();
        expect(breaker.endProbe).not.toHaveBeenCalled();
    });

    /**
     * Находка ревью 11.11.2026: без замка каждый разбор, у которого не
     * ответил и запасной, сам шёл пробой к зависшему VibeCode и ждал
     * таймаут — волнами, пока пул очереди разборов стоял.
     */
    it('пробу уже ведёт другой вызов — основного не зовём, отказ временный («проба уже идёт»)', async () => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation(
            () => undefined,
        );
        const openai = fakeAdapter('openai-compatible', {
            complete: jest
                .fn()
                .mockRejectedValue(
                    new Error('LLM (groq) x failed [413]: Request too large'),
                ),
        });
        const breaker = fakeBreaker({ vibecode: true }, false);
        const { gateway, vibecode } = makeGateway({}, { openai, breaker });

        const error: unknown = await gateway
            .complete(REQUEST)
            .catch((reason: unknown) => reason);

        // Адаптер дошёл до отправки, но шлюз запрос не пустил.
        expect(vibecode.sent).not.toHaveBeenCalled();
        expect(breaker.endProbe).not.toHaveBeenCalled();
        expect((error as Error).message).toContain(
            'vibecode — на паузе, пробный вызов уже идёт',
        );
        // Основной не ответил, потому что на паузе, — это временно, даже
        // при постоянном 413 запасного: звонок дозаполнит догон.
        expect(isTransientLlmError(error)).toBe(true);
        expect(error).toMatchObject({
            failures: expect.arrayContaining([
                { provider: 'vibecode', transient: true, paused: true },
            ]) as unknown,
        });
    });

    it('проба упала — замок всё равно снят своим маркером', async () => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation(
            () => undefined,
        );
        const vibecode = fakeAdapter('vibecode', {
            complete: jest.fn(
                async (_request: unknown, guard?: LlmSendGuard) => {
                    await guard?.beforeSend();
                    throw new Error('HTTP 503');
                },
            ),
        });
        const openai = fakeAdapter('openai-compatible', {
            complete: jest.fn().mockRejectedValue(new Error('fetch failed')),
        });
        const breaker = fakeBreaker({ vibecode: true });
        const { gateway } = makeGateway({}, { vibecode, openai, breaker });

        await expect(gateway.complete(REQUEST)).rejects.toBeInstanceOf(
            LlmUnavailableError,
        );
        const [, token] = breaker.tryStartProbe.mock.calls[0] as [
            string,
            string,
        ];
        expect(breaker.endProbe).toHaveBeenCalledWith('vibecode', token);
    });

    /**
     * Ревью 11.11.2026: каждый отложенный вызов слал своё «ПОПЫТКИ
     * ИСЧЕРПАНЫ», и Telegram глушил сообщение «снова отвечает».
     */
    it('основного не звали (на паузе, проба идёт) — тревога в телеграм одна за паузу, дальше — журнал', async () => {
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        const warn = jest.spyOn(Logger.prototype, 'warn');
        const openai = fakeAdapter('openai-compatible', {
            complete: jest
                .fn()
                .mockRejectedValue(
                    new Error('LLM (groq) x failed [413]: Request too large'),
                ),
        });
        const breaker = fakeBreaker({ vibecode: true }, false);
        breaker.claimPausedAlert
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false);
        const { gateway } = makeGateway({}, { openai, breaker });

        await gateway.complete(REQUEST).catch(() => undefined);
        await gateway.complete(REQUEST).catch(() => undefined);

        expect(breaker.claimPausedAlert).toHaveBeenCalledWith('vibecode');
        const alerts = error.mock.calls.filter(
            ([message]) =>
                typeof message === 'string' &&
                message.startsWith('ПОПЫТКИ ИСЧЕРПАНЫ'),
        );
        expect(alerts).toHaveLength(1);
        expect(alerts[0][1]).toEqual({ telegram: true });
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining(
                'основной vibecode на паузе, тревога о ней уже отправлена',
            ),
        );
    });

    it('основной сорвался сам — тревога на каждый такой отказ, без проверки паузы', async () => {
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        const vibecode = fakeAdapter('vibecode', {
            complete: jest.fn().mockRejectedValue(new Error('HTTP 503')),
        });
        const openai = fakeAdapter('openai-compatible', {
            complete: jest.fn().mockRejectedValue(new Error('fetch failed')),
        });
        const breaker = fakeBreaker();
        const { gateway } = makeGateway({}, { vibecode, openai, breaker });

        await gateway.complete(REQUEST).catch(() => undefined);

        expect(breaker.claimPausedAlert).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledWith(
            expect.stringContaining('ПОПЫТКИ ИСЧЕРПАНЫ'),
            { telegram: true },
        );
    });

    /**
     * Находка ревью 11.11.2026: вызов, вставший в очередь к VibeCode до
     * паузы, после слота всё равно уходил к зависшему поставщику и ждал
     * таймаут. Теперь адаптер перед отправкой зовёт проверку шлюза.
     */
    it('поставщик встал на паузу, пока вызов ждал очереди: запрос не уходит, сбоем не считается, отвечает запасной', async () => {
        const open: Partial<Record<LlmProviderCode, boolean>> = {};
        const breaker = fakeBreaker(open);
        const sent = jest.fn();
        const vibecode = fakeAdapter('vibecode', {
            complete: jest.fn(
                async (
                    request: unknown,
                    guard?: { beforeSend(): Promise<void> },
                ) => {
                    // Пока вызов «ждал слота», предохранитель открылся.
                    open.vibecode = true;
                    await guard?.beforeSend();
                    sent(request);
                    return responseOf('vibecode');
                },
            ),
        });
        const { gateway, openai } = makeGateway({}, { vibecode, breaker });

        const response = await gateway.complete(REQUEST);

        expect(response.provider).toBe('openai-compatible');
        expect(sent).not.toHaveBeenCalled();
        expect(openai.complete).toHaveBeenCalledTimes(1);
        expect(breaker.recordFailure).not.toHaveBeenCalled();
    });

    it('встал на паузу в очереди, запасной тоже упал — основного пробуем одним пробным вызовом', async () => {
        const open: Partial<Record<LlmProviderCode, boolean>> = {};
        const breaker = fakeBreaker(open);
        const vibecode = fakeAdapter('vibecode', {
            complete: jest
                .fn()
                .mockImplementationOnce(
                    async (
                        _request: unknown,
                        guard?: { beforeSend(): Promise<void> },
                    ) => {
                        open.vibecode = true;
                        await guard?.beforeSend();
                        return responseOf('vibecode');
                    },
                )
                .mockImplementationOnce(
                    async (_request: unknown, guard?: LlmSendGuard) => {
                        await guard?.beforeSend();
                        return responseOf('vibecode');
                    },
                ),
        });
        const openai = fakeAdapter('openai-compatible', {
            complete: jest.fn().mockRejectedValue(new Error('fetch failed')),
        });
        const { gateway } = makeGateway({}, { vibecode, openai, breaker });

        const response = await gateway.complete(REQUEST);

        expect(response.provider).toBe('vibecode');
        expect(vibecode.complete).toHaveBeenCalledTimes(2);
        expect(breaker.tryStartProbe).toHaveBeenCalledWith(
            'vibecode',
            expect.any(String),
        );
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

    it('порядок портала важнее общего: портал со своим ключом считает у себя, остальные — как приложение', async () => {
        const own = makeGateway(
            {},
            { portalOrder: ['openai-compatible', 'vibecode'] },
        );
        const response = await own.gateway.complete(REQUEST);
        expect(response.provider).toBe('openai-compatible');
        expect(own.vibecode.complete).not.toHaveBeenCalled();
        expect(own.orderResolver.orderFor).toHaveBeenCalledWith(DOMAIN);
        expect(own.gateway.order).toEqual(['vibecode', 'openai-compatible']);

        const availability = await own.gateway.availability(DOMAIN);
        expect(availability.map(item => item.code)).toEqual([
            'openai-compatible',
            'vibecode',
        ]);
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
        expect(vibecode.complete).toHaveBeenCalledWith(
            {
                domain: DOMAIN,
                systemPrompt: 'система',
                userContent: 'текст',
                schemaName: 'call_classification',
                schema: { type: 'object' },
                model: 'bitrix/custom',
            },
            expect.anything(),
        );
    });
});

/**
 * Явный порядок провайдеров запроса (ручка «любой промпт» и проверки
 * одного провайдера) важнее настройки портала; готовность провайдера по
 * коду — для чек-листов админки.
 */
describe('StructuredLlmGateway: явный порядок провайдеров запроса', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    it('providers в запросе важнее настройки портала и общего порядка', async () => {
        const { gateway, vibecode, openai, orderResolver } = makeGateway(
            {},
            { portalOrder: ['vibecode', 'openai-compatible'] },
        );

        const response = await gateway.complete({
            ...REQUEST,
            providers: ['openai-compatible'],
        });

        expect(response.provider).toBe('openai-compatible');
        expect(openai.complete).toHaveBeenCalledTimes(1);
        expect(vibecode.complete).not.toHaveBeenCalled();
        expect(orderResolver.orderFor).not.toHaveBeenCalled();
    });

    it('пустой список providers — обычный порядок портала', async () => {
        const { gateway, vibecode, orderResolver } = makeGateway();

        const response = await gateway.complete({ ...REQUEST, providers: [] });

        expect(response.provider).toBe('vibecode');
        expect(vibecode.complete).toHaveBeenCalledTimes(1);
        expect(orderResolver.orderFor).toHaveBeenCalledWith(DOMAIN);
    });

    it('явный провайдер без настройки — ошибка с его причиной, другие не пробуются', async () => {
        const { gateway, openai } = makeGateway(
            {},
            {
                vibecode: fakeAdapter('vibecode', {
                    issue: 'нет ключа VibeCode',
                }),
            },
        );

        await expect(
            gateway.complete({ ...REQUEST, providers: ['vibecode'] }),
        ).rejects.toThrow('vibecode — нет ключа VibeCode');
        expect(openai.complete).not.toHaveBeenCalled();
    });

    it('configurationIssueOf отдаёт причину провайдера для домена', async () => {
        const { gateway } = makeGateway(
            {},
            {
                vibecode: fakeAdapter('vibecode', {
                    issue: 'нет ключа VibeCode',
                }),
            },
        );

        await expect(
            gateway.configurationIssueOf('vibecode', DOMAIN),
        ).resolves.toBe('нет ключа VibeCode');
        await expect(
            gateway.configurationIssueOf('openai-compatible', DOMAIN),
        ).resolves.toBeNull();
    });
});

/**
 * Журнал каждого вызова модели (11.11.2026): по строке видно, сколько
 * провайдер писал ответ и через сколько сорвался. Формат строк закреплён в
 * llm-call-log.util.spec — здесь только то, что шлюз засекает время и
 * пишет строку на каждый вызов.
 */
describe('StructuredLlmGateway — журнал каждого вызова модели', () => {
    const START = 1_700_000_000_000;
    let clock: number;
    let log: jest.SpyInstance;
    let warn: jest.SpyInstance;

    beforeEach(() => {
        clock = START;
        jest.spyOn(Date, 'now').mockImplementation(() => clock);
        log = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => undefined);
        warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    /** Адаптер «думает» `ms` по часам теста, затем отвечает или падает. */
    function takingMs(
        ms: number,
        outcome: StructuredLlmResponse | Error,
    ): jest.Mock {
        return jest.fn(() => {
            clock += ms;
            return outcome instanceof Error
                ? Promise.reject(outcome)
                : Promise.resolve(outcome);
        });
    }

    it('удачный вызов — строка журнала с мс ответа и токенами', async () => {
        const vibecode = fakeAdapter('vibecode', {
            complete: takingMs(4_200, responseOf('vibecode')),
        });
        const { gateway } = makeGateway({}, { vibecode });

        await gateway.complete(REQUEST);

        expect(log).toHaveBeenCalledWith(
            expect.stringContaining(
                'LLM vibecode call_focus_form (test.bitrix24.ru): ответ за 4200 мс',
            ),
        );
        expect(log).toHaveBeenCalledWith(
            expect.stringContaining('токены промпта 10, ответа 5'),
        );
    });

    it('сбой — в предупреждении «через N мс», ответ запасного тоже в журнале', async () => {
        const vibecode = fakeAdapter('vibecode', {
            complete: takingMs(
                180_000,
                new Error('Vibecode call_focus_form timeout after 180000 ms'),
            ),
        });
        const openai = fakeAdapter('openai-compatible', {
            complete: takingMs(2_500, responseOf('openai-compatible')),
        });
        const { gateway, breaker } = makeGateway({}, { vibecode, openai });

        await gateway.complete(REQUEST);

        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining(
                'Провайдер LLM vibecode не ответил на call_focus_form (test.bitrix24.ru) через 180000 мс',
            ),
        );
        expect(breaker.recordFailure).toHaveBeenCalledWith(
            'vibecode',
            expect.stringContaining('timeout after 180000 ms'),
            START + 180_000,
            true,
        );
        expect(log).toHaveBeenCalledWith(
            expect.stringContaining(
                'LLM openai-compatible call_focus_form (test.bitrix24.ru): ответ за 2500 мс',
            ),
        );
    });

    /**
     * Ревью 11.11.2026: «через N мс» включало ожидание очереди — по журналу
     * казалось, что VibeCode молчал дольше своего срока.
     */
    it('сбой после очереди — «через» считает только молчание поставщика, ожидание слота отдельно', async () => {
        const vibecode = fakeAdapter('vibecode', {
            complete: jest.fn(
                async (_request: unknown, guard?: LlmSendGuard) => {
                    clock += 30_000; // ждал слота
                    await guard?.beforeSend();
                    clock += 180_000; // поставщик молчал
                    throw new Error(
                        'Vibecode call_focus_form timeout after 180000 ms',
                    );
                },
            ),
        });
        const { gateway } = makeGateway({}, { vibecode });

        await gateway.complete(REQUEST);

        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining(
                'не ответил на call_focus_form (test.bitrix24.ru) через 180000 мс (ждал слота 30000 мс)',
            ),
        );
    });
});
