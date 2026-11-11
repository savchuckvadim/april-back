import { LlmUnavailableError } from '@lib/llm-gateway';
import { isFocusProviderFailure } from '../services/call-focus-failure.util';

/**
 * Сводная ошибка шлюза (отказали все) с исходами основного и запасного —
 * как её собирает шлюз: основной поставщик — VibeCode.
 */
const gatewayError = (vibecode: boolean, fallback: boolean) =>
    new LlmUnavailableError(
        'LLM недоступна для call_focus_form (d): …',
        [
            { provider: 'vibecode', transient: vibecode },
            { provider: 'openai-compatible', transient: fallback },
        ],
        'vibecode',
    );

describe('isFocusProviderFailure — провал фокус-разбора из-за поставщика', () => {
    it('таймаут вызова модели — сбой поставщика', () => {
        expect(
            isFocusProviderFailure([
                new Error('Vibecode call_focus_form timeout after 180000 ms'),
            ]),
        ).toBe(true);
    });

    it('429 и 5xx — сбой поставщика', () => {
        expect(
            isFocusProviderFailure([new Error('x failed [429]: slow down')]),
        ).toBe(true);
        expect(
            isFocusProviderFailure([new Error('x failed [502]: bad gateway')]),
        ).toBe(true);
    });

    it('отказали все: основной по таймауту, запасной 413 — сбой поставщика', () => {
        expect(isFocusProviderFailure([gatewayError(true, false)])).toBe(true);
    });

    it('негодный ответ модели (JSON, схема) — причина другая', () => {
        expect(isFocusProviderFailure([gatewayError(false, false)])).toBe(
            false,
        );
        expect(
            isFocusProviderFailure([
                new SyntaxError('Unexpected end of JSON input'),
                new Error('x failed [400]: invalid schema'),
            ]),
        ).toBe(false);
    });

    it('хоть один проход оборвался на поставщике — сбой поставщика, даже если другой ответил негодным JSON', () => {
        expect(
            isFocusProviderFailure([
                new SyntaxError('Unexpected token'),
                gatewayError(true, false),
            ]),
        ).toBe(true);
    });

    /**
     * Находка ревью 11.11.2026: 429 бесплатного Groq маскировал негодный
     * ответ VibeCode — конвейер считал это сбоем поставщика и не звал
     * цельную страховку, которая могла пройти.
     */
    it('негодный ответ VibeCode, запасной Groq ответил 429 — не сбой поставщика: решает основной', () => {
        expect(isFocusProviderFailure([gatewayError(false, true)])).toBe(false);
    });

    it('ошибок нет (проход вернул пустой результат) — причина другая', () => {
        expect(isFocusProviderFailure([])).toBe(false);
    });
});
