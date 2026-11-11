import {
    describeLlmError,
    isTransientLlmError,
    llmErrorStatus,
} from '../llm-error.util';
import {
    LlmProviderPausedError,
    LlmUnavailableError,
} from '../llm-unavailable.error';

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

    it('сводная ошибка шлюза: временная, если хоть один поставщик сорвался временно; текст не разбирается', () => {
        // VibeCode не дождался ответа, запасной отказал 413: первым кодом в
        // тексте стоит 413 — по тексту отказ выглядел бы постоянным.
        const timeoutThen413 = new LlmUnavailableError(
            'LLM недоступна для call_focus_form (d): ' +
                'vibecode — Vibecode call_focus_form timeout after 180000 ms; ' +
                'openai-compatible — HTTP 413: Request too large',
            [
                { provider: 'vibecode', transient: true },
                { provider: 'openai-compatible', transient: false },
            ],
        );
        expect(llmErrorStatus(timeoutThen413)).toBe(413);
        expect(isTransientLlmError(timeoutThen413)).toBe(true);

        // Негодный JSON у основного, отказ схемы у запасного — не временная.
        const badAnswer = new LlmUnavailableError(
            'LLM недоступна для call_focus_form (d): ' +
                'vibecode — Unexpected end of JSON input; ' +
                'openai-compatible — HTTP 400: invalid schema',
            [
                { provider: 'vibecode', transient: false },
                { provider: 'openai-compatible', transient: false },
            ],
        );
        expect(isTransientLlmError(badAnswer)).toBe(false);

        // Ни к кому не обращались (никто не настроен) — тоже не временная.
        const nobody = new LlmUnavailableError(
            'LLM недоступна: vibecode — нет ключа',
            [],
        );
        expect(isTransientLlmError(nobody)).toBe(false);
    });

    /**
     * Находка ревью 11.11.2026: решает ОСНОВНОЙ поставщик, а не «хоть один»
     * — 429 бесплатного Groq не должен делать временным негодный ответ
     * VibeCode (тогда конвейер не звал цельную страховку, которая могла
     * пройти).
     */
    it('сводная ошибка с основным поставщиком: решает его последняя попытка', () => {
        const badJsonThen429 = new LlmUnavailableError(
            'LLM недоступна',
            [
                { provider: 'vibecode', transient: false },
                { provider: 'openai-compatible', transient: true },
            ],
            'vibecode',
        );
        expect(isTransientLlmError(badJsonThen429)).toBe(false);

        const timeoutThen400 = new LlmUnavailableError(
            'LLM недоступна',
            [
                { provider: 'vibecode', transient: true },
                { provider: 'openai-compatible', transient: false },
            ],
            'vibecode',
        );
        expect(isTransientLlmError(timeoutThen400)).toBe(true);

        // Пауза в первой попытке, проба потом ответила негодным JSON — решает проба.
        const probeBadAnswer = new LlmUnavailableError(
            'LLM недоступна',
            [
                { provider: 'vibecode', transient: true },
                { provider: 'openai-compatible', transient: true },
                { provider: 'vibecode', transient: false },
            ],
            'vibecode',
        );
        expect(isTransientLlmError(probeBadAnswer)).toBe(false);
    });

    it('основного не звали (на паузе, проба уже шла) — временная', () => {
        const pausedPrimary = new LlmUnavailableError(
            'LLM недоступна',
            [{ provider: 'openai-compatible', transient: false }],
            'vibecode',
        );
        expect(isTransientLlmError(pausedPrimary)).toBe(true);
    });

    it('поставщик встал на паузу, пока вызов ждал очереди, — временная', () => {
        expect(
            isTransientLlmError(new LlmProviderPausedError('vibecode')),
        ).toBe(true);
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
