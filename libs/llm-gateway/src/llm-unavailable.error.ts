import type { LlmProviderCode } from './structured-llm.types';

/** Сорвавшийся вызов одного поставщика — в сводной ошибке шлюза. */
export interface LlmProviderFailure {
    provider: LlmProviderCode;
    /**
     * Временный ли сбой (isTransientLlmError): таймаут, 5xx, 429, 408, сеть.
     * Поставщик на паузе, к которому вызов не пустили, — тоже временный.
     */
    transient: boolean;
    /**
     * Запрос не уходил: поставщик на паузе предохранителя (встал на паузу,
     * пока вызов ждал очереди, или пробный вызов уже шёл). Сам поставщик в
     * этом вызове не сорвался.
     */
    paused?: boolean;
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
 * Почему запрос к поставщику на паузе не ушёл: `paused` — встал на паузу,
 * пока вызов ждал очереди; `probe-busy` — пробный вызов к нему уже идёт
 * (одна проба за раз на все реплики).
 */
export type LlmProviderPausedReason = 'paused' | 'probe-busy';

/**
 * Запрос к поставщику не отправлен — тот на паузе предохранителя
 * (11.11.2026); шлюз идёт к следующему поставщику. Сбоем поставщика для
 * предохранителя не считается — к нему не обращались.
 */
export class LlmProviderPausedError extends Error {
    constructor(
        readonly provider: LlmProviderCode,
        readonly reason: LlmProviderPausedReason = 'paused',
    ) {
        super(
            reason === 'probe-busy'
                ? `Поставщик ${provider} на паузе, пробный вызов уже идёт`
                : `Поставщик ${provider} встал на паузу, пока вызов ждал очереди`,
        );
        this.name = 'LlmProviderPausedError';
    }
}
