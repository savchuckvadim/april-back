import type { LlmProviderCode } from './structured-llm.types';

/** Сорвавшийся вызов одного поставщика — в сводной ошибке шлюза. */
export interface LlmProviderFailure {
    provider: LlmProviderCode;
    /**
     * Временный ли сбой (isTransientLlmError): таймаут, 5xx, 429, 408, сеть.
     * Поставщик на паузе, к которому вызов не пустили, — тоже временный.
     */
    transient: boolean;
}

/**
 * Шлюз не получил ответа ни от одного поставщика (11.11.2026). Текст —
 * прежний: все причины подряд, для журнала и админки. `failures` —
 * сорвавшиеся вызовы по порядку попыток; не настроенные поставщики сюда не
 * входят, к ним шлюз не обращался. `primary` — первый настроенный
 * поставщик порядка (null — не настроен никто).
 *
 * Временный ли отказ, isTransientLlmError решает по основному поставщику, а
 * не по тексту и не по любому: 429 запасного Groq не делает временным
 * негодный ответ VibeCode, а 413 запасного не делает постоянным таймаут
 * VibeCode.
 */
export class LlmUnavailableError extends Error {
    constructor(
        message: string,
        readonly failures: readonly LlmProviderFailure[],
        readonly primary: LlmProviderCode | null = null,
    ) {
        super(message);
        this.name = 'LlmUnavailableError';
    }
}

/**
 * Поставщик встал на паузу предохранителя, пока вызов ждал своей очереди у
 * адаптера (11.11.2026): запрос не отправлен, шлюз идёт к следующему
 * поставщику. Сбоем поставщика для предохранителя не считается — к нему не
 * обращались.
 */
export class LlmProviderPausedError extends Error {
    constructor(readonly provider: LlmProviderCode) {
        super(`Поставщик ${provider} встал на паузу, пока вызов ждал очереди`);
        this.name = 'LlmProviderPausedError';
    }
}
