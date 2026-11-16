import { LlmUnavailableError } from '@lib/llm-gateway';
import {
    runWaveWithRetry,
    settleWaveCall,
    type WaveAttempt,
    type WaveCall,
} from '../services/call-focus-retry.util';

const RETRYABLE = new Error('timeout');
const PERMANENT = new Error('bad json');
const isRetryable = (error: unknown): boolean => error === RETRYABLE;

/** Вызов, который на каждой попытке отдаёт следующий исход из списка. */
function call(
    key: string,
    ...outcomes: (string | Error)[]
): WaveCall<string, string> & { run: jest.Mock } {
    const run = jest.fn((attempt: WaveAttempt) => {
        const outcome = outcomes[attempt - 1];
        return outcome instanceof Error
            ? Promise.reject(outcome)
            : Promise.resolve(outcome);
    });
    return { key, run };
}

describe('runWaveWithRetry — один повтор одиночного сбоя', () => {
    it('все ответили — повторов нет', async () => {
        const calls = [call('form', 'a'), call('content', 'b')];
        const wave = await runWaveWithRetry(calls, isRetryable);

        expect(wave.get('form')).toEqual({ ok: true, value: 'a', attempts: 1 });
        expect(wave.get('content')).toEqual({
            ok: true,
            value: 'b',
            attempts: 1,
        });
        expect(calls[0].run).toHaveBeenCalledTimes(1);
    });

    it('сорвался один и причина временная — повтор после остальных, он вылечил', async () => {
        const movement = call('movement', RETRYABLE, 'c');
        const onRetry = jest.fn();
        const wave = await runWaveWithRetry(
            [call('form', 'a'), call('content', 'b'), movement],
            isRetryable,
            onRetry,
        );

        expect(wave.get('movement')).toEqual({
            ok: true,
            value: 'c',
            attempts: 2,
        });
        expect(movement.run).toHaveBeenNthCalledWith(1, 1);
        expect(movement.run).toHaveBeenNthCalledWith(2, 2);
        expect(onRetry).toHaveBeenCalledWith('movement', RETRYABLE);
    });

    it('повтор тоже сорвался — в итоге ошибка второй попытки', async () => {
        const second = new Error('timeout again');
        const wave = await runWaveWithRetry(
            [call('form', 'a'), call('movement', RETRYABLE, second)],
            isRetryable,
        );

        expect(wave.get('movement')).toEqual({
            ok: false,
            error: second,
            attempts: 2,
        });
    });

    it('причина постоянная — повтора нет', async () => {
        const content = call('content', PERMANENT, 'never');
        const wave = await runWaveWithRetry(
            [call('form', 'a'), content],
            isRetryable,
        );

        expect(wave.get('content')).toEqual({
            ok: false,
            error: PERMANENT,
            attempts: 1,
        });
        expect(content.run).toHaveBeenCalledTimes(1);
    });

    it('сорвались двое — поставщик не справляется, повторов нет', async () => {
        const form = call('form', RETRYABLE, 'x');
        const movement = call('movement', RETRYABLE, 'y');
        const onRetry = jest.fn();
        const wave = await runWaveWithRetry(
            [form, call('content', 'b'), movement],
            isRetryable,
            onRetry,
        );

        expect(wave.get('form')?.ok).toBe(false);
        expect(wave.get('movement')?.ok).toBe(false);
        expect(form.run).toHaveBeenCalledTimes(1);
        expect(movement.run).toHaveBeenCalledTimes(1);
        expect(onRetry).not.toHaveBeenCalled();
    });
});

describe('settleWaveCall — итог вызова, журнал и отложенная тревога', () => {
    const INFO = {
        title: 'Фокус «движение сделки»',
        schemaName: 'call_focus_movement',
        domain: 'test.bitrix24.ru',
    };
    const gatewayError = () =>
        new LlmUnavailableError(
            'LLM недоступна: vibecode — timeout',
            [{ provider: 'vibecode', transient: true }],
            'vibecode',
        );
    const makeDeps = () => ({
        warn: jest.fn(),
        reportExhausted: jest.fn().mockResolvedValue(undefined),
    });

    it('ответ есть — он и возвращается, без журнала и тревоги', async () => {
        const deps = makeDeps();
        const failures: unknown[] = [];
        const value = await settleWaveCall(
            { ok: true, value: 'answer', attempts: 2 },
            INFO,
            deps,
            failures,
        );

        expect(value).toBe('answer');
        expect(failures).toEqual([]);
        expect(deps.warn).not.toHaveBeenCalled();
        expect(deps.reportExhausted).not.toHaveBeenCalled();
    });

    it('сбой без повтора — отложенная тревога уходит сейчас, ошибка в списке сбоев', async () => {
        const deps = makeDeps();
        const failures: unknown[] = [];
        const error = gatewayError();
        const value = await settleWaveCall(
            { ok: false, error, attempts: 1 },
            INFO,
            deps,
            failures,
        );

        expect(value).toBeNull();
        expect(failures).toEqual([error]);
        expect(deps.warn).toHaveBeenCalledWith(
            'Фокус «движение сделки» не выполнен (test.bitrix24.ru): LLM недоступна: vibecode — timeout',
        );
        expect(deps.reportExhausted).toHaveBeenCalledWith(error, {
            schemaName: 'call_focus_movement',
            domain: 'test.bitrix24.ru',
        });
    });

    it('сбой после повтора — шлюз уже потревожил сам, второй тревоги нет', async () => {
        const deps = makeDeps();
        await settleWaveCall(
            { ok: false, error: gatewayError(), attempts: 2 },
            INFO,
            deps,
        );

        expect(deps.reportExhausted).not.toHaveBeenCalled();
        expect(deps.warn).toHaveBeenCalledWith(
            expect.stringContaining(
                'не выполнен (test.bitrix24.ru) и после повтора',
            ),
        );
    });

    it('ошибка не от шлюза — тревоги нет; вызова в волне не было — null', async () => {
        const deps = makeDeps();
        expect(
            await settleWaveCall(
                { ok: false, error: new Error('boom'), attempts: 1 },
                INFO,
                deps,
            ),
        ).toBeNull();
        expect(deps.reportExhausted).not.toHaveBeenCalled();
        expect(await settleWaveCall(undefined, INFO, deps)).toBeNull();
    });
});
