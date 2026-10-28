import {
    describeLlmError,
    isTransientLlmError,
    llmErrorStatus,
} from '../llm-error.util';

describe('llm-error.util — классификация ошибок провайдеров', () => {
    it('код HTTP читается из текста клиента в обеих формах', () => {
        expect(
            llmErrorStatus(new Error('Vibecode call_focus failed [502]: bad')),
        ).toBe(502);
        expect(llmErrorStatus(new Error('Яндекс SpeechKit: HTTP 429'))).toBe(
            429,
        );
        expect(
            llmErrorStatus(new Error('Request failed with status code 429')),
        ).toBe(429);
        expect(llmErrorStatus(new Error('fetch failed'))).toBeNull();
    });

    it('5xx, 429, 408, сеть и таймаут — временные; 4xx и прочее — нет', () => {
        expect(isTransientLlmError(new Error('x failed [500]: y'))).toBe(true);
        expect(isTransientLlmError(new Error('x failed [429]: y'))).toBe(true);
        expect(isTransientLlmError(new Error('x failed [408]: y'))).toBe(true);
        expect(isTransientLlmError(new Error('x failed [401]: y'))).toBe(false);
        expect(isTransientLlmError(new Error('x failed [400]: y'))).toBe(false);
        expect(isTransientLlmError(new TypeError('fetch failed'))).toBe(true);
        expect(isTransientLlmError(new Error('socket hang up'))).toBe(true);
        const timeout = new Error('The operation was aborted due to timeout');
        timeout.name = 'TimeoutError';
        expect(isTransientLlmError(timeout)).toBe(true);
        expect(isTransientLlmError(new Error('Unexpected token'))).toBe(false);
        expect(isTransientLlmError('строка')).toBe(false);
    });

    it('описание для логов: код и начало текста, пробелы схлопнуты', () => {
        expect(
            describeLlmError(
                new Error('Vibecode x failed [503]: Service\n  down'),
            ),
        ).toBe('HTTP 503: Vibecode x failed [503]: Service down');
        expect(describeLlmError(new Error('fetch failed'))).toBe(
            'fetch failed',
        );
        expect(describeLlmError(new Error('a'.repeat(300))).length).toBe(200);
    });
});
