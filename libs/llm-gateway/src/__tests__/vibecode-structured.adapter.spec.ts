import { Logger } from '@nestjs/common';
import type {
    VibeCodeClient,
    VibecodeStructuredCompletionWithUsage,
} from '@lib/vibecode';
import { VibecodeStructuredAdapter } from '../adapters/vibecode-structured.adapter';
import { LlmGatewaySettingsService } from '../llm-gateway-settings.service';
import { LlmProviderPausedError } from '../llm-unavailable.error';
import { StructuredLlmGateway } from '../structured-llm.gateway';
import type { StructuredLlmRequest } from '../structured-llm.types';

const PORTAL_A = 'a.bitrix24.ru';
const PORTAL_B = 'b.bitrix24.ru';
/** Второй портал того же клиента — с тем же ключом VibeCode. */
const PORTAL_A_TWIN = 'a2.bitrix24.ru';

/** vibeKey порталов — как их отдаёт VibeKeyResolverService. */
const KEYS: Record<string, string> = {
    [PORTAL_A]: 'vibe-key-a',
    [PORTAL_A_TWIN]: 'vibe-key-a',
    [PORTAL_B]: 'vibe-key-b',
};

const requestFor = (domain: string, model?: string): StructuredLlmRequest => ({
    domain,
    systemPrompt: 'система',
    userContent: 'текст',
    schemaName: 'call_focus_form',
    schema: { type: 'object' },
    ...(model ? { model } : {}),
});

const ANSWER: VibecodeStructuredCompletionWithUsage = {
    result: { score: 7 },
    usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
    model: 'bitrix/bitrixgpt-5.5',
};

type ClientArgs = Parameters<VibeCodeClient['structuredCompletionWithUsage']>;

/** Ответ модели, который тест отпускает сам, — порядок без таймеров jest. */
interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
    let resolve: (value: T) => void = () => undefined;
    let reject: (reason: unknown) => void = () => undefined;
    const promise = new Promise<T>((onValue, onError) => {
        resolve = onValue;
        reject = onError;
    });
    return { promise, resolve, reject };
}

/** Дать отработать микрозадачам: резолв ключа, захват слотов, вызов клиента. */
const flush = () => new Promise<void>(done => setImmediate(done));

const makeAdapter = (values: Record<string, string> = {}) => {
    const client = {
        structuredCompletionWithUsage: jest.fn<
            Promise<VibecodeStructuredCompletionWithUsage>,
            ClientArgs
        >(() => Promise.resolve(ANSWER)),
    };
    const keys = {
        resolve: jest.fn((domain: string) =>
            domain in KEYS
                ? Promise.resolve(KEYS[domain])
                : Promise.reject(
                      new Error(`VibeCode-ключ не заведён для ${domain}`),
                  ),
        ),
    };
    // Настройки «из админки»: тест может менять `values` по ходу — адаптер
    // перечитывает пределы на каждом вызове.
    const reader = {
        get: (name: string) => Promise.resolve(values[name] ?? null),
        getMany: (names: readonly string[]) =>
            Promise.resolve(
                Object.fromEntries(
                    names.map(name => [name, values[name] ?? null]),
                ),
            ),
    };
    const adapter = new VibecodeStructuredAdapter(
        client as never,
        keys as never,
        new LlmGatewaySettingsService(
            { get: () => undefined } as never,
            reader,
        ),
    );
    /** С какими ключами вызывалась модель — по порядку отправки запросов. */
    const sentKeys = (): string[] =>
        client.structuredCompletionWithUsage.mock.calls.map(call => call[4]);
    /** Первый вызов модели «думает», пока тест не отпустит ответ. */
    const holdFirstAnswer = () => {
        const answer = deferred<VibecodeStructuredCompletionWithUsage>();
        client.structuredCompletionWithUsage.mockImplementationOnce(
            () => answer.promise,
        );
        return answer;
    };
    return { adapter, client, sentKeys, holdFirstAnswer };
};

/**
 * Ограничитель одновременных запросов к VibeCode (11.11.2026): слот ключа
 * портала, затем общий слот процесса. Разбор пределов — в
 * llm-gateway-settings.spec, отпечаток
 * ключа — в llm-concurrency.util.spec.
 */
describe('VibecodeStructuredAdapter — ограничитель одновременных запросов', () => {
    const START = 1_700_000_000_000;
    let clock: number;

    beforeEach(() => {
        clock = START;
        jest.spyOn(Date, 'now').mockImplementation(() => clock);
    });
    afterEach(() => jest.restoreAllMocks());

    it('слоты свободны — запрос уходит сразу с ключом и моделью портала, queueMs 0', async () => {
        const { adapter, client } = makeAdapter();

        const response = await adapter.complete(
            requestFor(PORTAL_A, 'bitrix/bitrixgpt-5.6'),
        );

        expect(response).toEqual({
            ...ANSWER,
            provider: 'vibecode',
            queueMs: 0,
        });
        expect(client.structuredCompletionWithUsage).toHaveBeenCalledWith(
            'система',
            'текст',
            'call_focus_form',
            { type: 'object' },
            'vibe-key-a',
            { model: 'bitrix/bitrixgpt-5.6' },
        );

        await adapter.complete(requestFor(PORTAL_B));
        expect(client.structuredCompletionWithUsage).toHaveBeenLastCalledWith(
            'система',
            'текст',
            'call_focus_form',
            { type: 'object' },
            'vibe-key-b',
            undefined,
        );
    });

    it('лимит на ключ 1: второй запрос портала ждёт слота и модель до слота не вызывает, другой портал идёт сразу', async () => {
        const { adapter, sentKeys, holdFirstAnswer } = makeAdapter({
            LLM_VIBECODE_KEY_CONCURRENCY: '1',
        });
        const firstAnswer = holdFirstAnswer();

        const first = adapter.complete(requestFor(PORTAL_A));
        await flush();
        const second = adapter.complete(requestFor(PORTAL_A));
        const other = adapter.complete(requestFor(PORTAL_B));
        await flush();

        // Второй запрос портала A в очереди: клиент для него не вызван, а
        // значит, и AbortSignal.timeout его запроса ещё не создан.
        expect(sentKeys()).toEqual(['vibe-key-a', 'vibe-key-b']);
        await expect(other).resolves.toMatchObject({ queueMs: 0 });

        firstAnswer.resolve(ANSWER);
        await expect(first).resolves.toMatchObject({ provider: 'vibecode' });
        await expect(second).resolves.toMatchObject({ provider: 'vibecode' });
        expect(sentKeys()).toEqual(['vibe-key-a', 'vibe-key-b', 'vibe-key-a']);
    });

    it('лимит считается по ключу, а не по домену: два портала с одним ключом делят его слоты', async () => {
        const { adapter, sentKeys, holdFirstAnswer } = makeAdapter({
            LLM_VIBECODE_KEY_CONCURRENCY: '1',
        });
        const firstAnswer = holdFirstAnswer();

        const first = adapter.complete(requestFor(PORTAL_A));
        await flush();
        const twin = adapter.complete(requestFor(PORTAL_A_TWIN));
        await flush();
        expect(sentKeys()).toEqual(['vibe-key-a']);

        firstAnswer.resolve(ANSWER);
        await first;
        await twin;
        expect(sentKeys()).toEqual(['vibe-key-a', 'vibe-key-a']);
    });

    it('общий лимит 1: запрос другого портала ждёт, пока не ответит первый', async () => {
        const { adapter, sentKeys, holdFirstAnswer } = makeAdapter({
            LLM_VIBECODE_CONCURRENCY: '1',
        });
        const firstAnswer = holdFirstAnswer();

        const first = adapter.complete(requestFor(PORTAL_A));
        await flush();
        const other = adapter.complete(requestFor(PORTAL_B));
        await flush();
        expect(sentKeys()).toEqual(['vibe-key-a']);

        firstAnswer.resolve(ANSWER);
        await first;
        await expect(other).resolves.toMatchObject({ provider: 'vibecode' });
        expect(sentKeys()).toEqual(['vibe-key-a', 'vibe-key-b']);
    });

    it('ждущий слота своего ключа общий слот не занимает: другой портал не простаивает', async () => {
        const { adapter, sentKeys, holdFirstAnswer } = makeAdapter({
            LLM_VIBECODE_KEY_CONCURRENCY: '1',
            LLM_VIBECODE_CONCURRENCY: '2',
        });
        const firstAnswer = holdFirstAnswer();

        const first = adapter.complete(requestFor(PORTAL_A));
        await flush();
        const second = adapter.complete(requestFor(PORTAL_A));
        await flush();
        const other = adapter.complete(requestFor(PORTAL_B));
        await flush();

        // При захвате «сначала общий» второй запрос A занял бы второй общий
        // слот и стоял в очереди ключа, а портал B ждал бы впустую.
        expect(sentKeys()).toEqual(['vibe-key-a', 'vibe-key-b']);
        await expect(other).resolves.toMatchObject({ queueMs: 0 });

        firstAnswer.resolve(ANSWER);
        await first;
        await second;
        expect(sentKeys()).toEqual(['vibe-key-a', 'vibe-key-b', 'vibe-key-a']);
    });

    it('ошибка модели освобождает оба слота: ждущие уходят по очереди, ошибка доходит до шлюза как есть', async () => {
        const { adapter, sentKeys, holdFirstAnswer } = makeAdapter({
            LLM_VIBECODE_KEY_CONCURRENCY: '1',
            LLM_VIBECODE_CONCURRENCY: '1',
        });
        const firstAnswer = holdFirstAnswer();

        const first = adapter.complete(requestFor(PORTAL_A));
        await flush();
        const second = adapter.complete(requestFor(PORTAL_A));
        const other = adapter.complete(requestFor(PORTAL_B));
        await flush();
        expect(sentKeys()).toEqual(['vibe-key-a']);

        const failure = new Error(
            'Vibecode call_focus_form timeout after 180000 ms',
        );
        firstAnswer.reject(failure);

        await expect(first).rejects.toBe(failure);
        await expect(second).resolves.toMatchObject({ provider: 'vibecode' });
        await expect(other).resolves.toMatchObject({ provider: 'vibecode' });
        // Общий слот — тому, кто встал в его очередь раньше (портал B
        // держал слот ключа и ждал общий), затем второй запрос портала A.
        expect(sentKeys()).toEqual(['vibe-key-a', 'vibe-key-b', 'vibe-key-a']);
    });

    it('queueMs — сколько запрос ждал слота; время ответа модели в него не входит', async () => {
        const { adapter, holdFirstAnswer } = makeAdapter({
            LLM_VIBECODE_KEY_CONCURRENCY: '1',
        });
        const firstAnswer = holdFirstAnswer();

        const first = adapter.complete(requestFor(PORTAL_A));
        await flush();
        const second = adapter.complete(requestFor(PORTAL_A));
        await flush();

        // Модель писала первый ответ 42 с — всё это время второй ждал слота.
        clock += 42_000;
        firstAnswer.resolve(ANSWER);

        await expect(first).resolves.toMatchObject({ queueMs: 0 });
        await expect(second).resolves.toMatchObject({ queueMs: 42_000 });
    });

    /** Пределы — «Настройки приложения» в админке (11.11.2026), без перезапуска. */
    it('предел подняли в админке — ждущий запрос уходит со следующим вызовом, не дожидаясь ответа модели', async () => {
        const values: Record<string, string> = {
            LLM_VIBECODE_KEY_CONCURRENCY: '1',
        };
        const { adapter, sentKeys, holdFirstAnswer } = makeAdapter(values);
        const firstAnswer = holdFirstAnswer();

        const first = adapter.complete(requestFor(PORTAL_A));
        await flush();
        const second = adapter.complete(requestFor(PORTAL_A));
        await flush();
        expect(sentKeys()).toEqual(['vibe-key-a']);

        values.LLM_VIBECODE_KEY_CONCURRENCY = '3';
        const third = adapter.complete(requestFor(PORTAL_A));
        await flush();
        // Первый ещё «думает», а второй и третий уже отправлены.
        expect(sentKeys()).toEqual(['vibe-key-a', 'vibe-key-a', 'vibe-key-a']);

        firstAnswer.resolve(ANSWER);
        await Promise.all([first, second, third]);
    });

    it('предел опустили — идущие доделываются, новые ждут, пока занятых не станет меньше предела', async () => {
        const values: Record<string, string> = {
            LLM_VIBECODE_KEY_CONCURRENCY: '2',
        };
        const { adapter, client, sentKeys } = makeAdapter(values);
        const answers = [
            deferred<VibecodeStructuredCompletionWithUsage>(),
            deferred<VibecodeStructuredCompletionWithUsage>(),
        ];
        client.structuredCompletionWithUsage
            .mockImplementationOnce(() => answers[0].promise)
            .mockImplementationOnce(() => answers[1].promise);

        const first = adapter.complete(requestFor(PORTAL_A));
        const second = adapter.complete(requestFor(PORTAL_A));
        await flush();
        expect(sentKeys()).toHaveLength(2);

        values.LLM_VIBECODE_KEY_CONCURRENCY = '1';
        const third = adapter.complete(requestFor(PORTAL_A));
        await flush();
        expect(sentKeys()).toHaveLength(2);

        // Ответил первый — занят ещё второй, предел 1: третий ждёт дальше.
        answers[0].resolve(ANSWER);
        await first;
        await flush();
        expect(sentKeys()).toHaveLength(2);

        answers[1].resolve(ANSWER);
        await second;
        await expect(third).resolves.toMatchObject({ provider: 'vibecode' });
        expect(sentKeys()).toHaveLength(3);
    });

    /**
     * Находка ревью 11.11.2026: вставший в очередь до паузы предохранителя
     * запрос после слота всё равно уходил к зависшему поставщику и ждал
     * таймаут. Проверка шлюза зовётся внутри слота, перед отправкой.
     */
    it('поставщик встал на паузу, пока запрос ждал слота: модель не зовётся, слот сразу свободен', async () => {
        const { adapter, sentKeys, holdFirstAnswer } = makeAdapter({
            LLM_VIBECODE_KEY_CONCURRENCY: '1',
        });
        const firstAnswer = holdFirstAnswer();
        const paused = {
            beforeSend: () =>
                Promise.reject(new LlmProviderPausedError('vibecode')),
        };

        const first = adapter.complete(requestFor(PORTAL_A));
        await flush();
        const second = adapter.complete(requestFor(PORTAL_A), paused);
        const third = adapter.complete(requestFor(PORTAL_A));
        await flush();
        expect(sentKeys()).toEqual(['vibe-key-a']);

        firstAnswer.resolve(ANSWER);
        await first;
        await expect(second).rejects.toBeInstanceOf(LlmProviderPausedError);
        await expect(third).resolves.toMatchObject({ provider: 'vibecode' });
        // Второй к модели не ходил: ушли только первый и третий.
        expect(sentKeys()).toEqual(['vibe-key-a', 'vibe-key-a']);
    });

    it('портал без ключа: configurationIssue — причина резолвера, complete падает до очереди без запроса', async () => {
        const { adapter, client } = makeAdapter();

        await expect(adapter.configurationIssue(PORTAL_A)).resolves.toBeNull();
        await expect(
            adapter.configurationIssue('unknown.bitrix24.ru'),
        ).resolves.toBe('VibeCode-ключ не заведён для unknown.bitrix24.ru');
        await expect(
            adapter.complete(requestFor('unknown.bitrix24.ru')),
        ).rejects.toThrow('VibeCode-ключ не заведён');
        expect(client.structuredCompletionWithUsage).not.toHaveBeenCalled();
    });
});

/**
 * Связка с настоящим шлюзом: ожидание слота не бросает ошибок, поэтому
 * предохранитель его не видит, а журнал вызова показывает его отдельно от
 * времени ответа модели (формат строки — llm-call-log.util.spec).
 */
describe('VibecodeStructuredAdapter в шлюзе — ожидание слота не сбой', () => {
    afterEach(() => jest.restoreAllMocks());

    it('предохранитель считает оба вызова удачными, журнал пишет «ждал слота» отдельно', async () => {
        let clock = 1_700_000_000_000;
        jest.spyOn(Date, 'now').mockImplementation(() => clock);
        const log = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => undefined);
        const { adapter, holdFirstAnswer } = makeAdapter({
            LLM_VIBECODE_KEY_CONCURRENCY: '1',
        });
        const breaker = {
            isOpen: jest.fn().mockResolvedValue(false),
            recordSuccess: jest.fn().mockResolvedValue(undefined),
            recordFailure: jest.fn().mockResolvedValue(undefined),
        };
        const orderResolver = {
            orderFor: jest.fn().mockResolvedValue(['vibecode']),
        };
        const gateway = new StructuredLlmGateway(
            orderResolver as never,
            breaker as never,
            adapter,
            {} as never,
            {} as never,
        );
        const firstAnswer = holdFirstAnswer();

        const first = gateway.complete(requestFor(PORTAL_A));
        await flush();
        const second = gateway.complete(requestFor(PORTAL_A));
        await flush();
        clock += 42_000;
        firstAnswer.resolve(ANSWER);
        await first;
        await expect(second).resolves.toMatchObject({ queueMs: 42_000 });

        expect(breaker.recordFailure).not.toHaveBeenCalled();
        expect(breaker.recordSuccess).toHaveBeenCalledTimes(2);
        expect(log).toHaveBeenCalledWith(
            expect.stringContaining('ответ за 42000 мс, вход'),
        );
        expect(log).toHaveBeenCalledWith(
            expect.stringContaining('ответ за 0 мс, ждал слота 42000 мс'),
        );
    });
});
