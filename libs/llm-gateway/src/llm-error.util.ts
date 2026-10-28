/**
 * Классификация ошибок провайдеров LLM. Клиенты бросают обычный Error с
 * кодом в тексте («… failed [502]: …», «HTTP 503», axios-овое «Request
 * failed with status code 429» у моделей оркестратора), сетевые обрывы и
 * таймауты fetch — без кода. Временная ошибка (5xx, 429, 408, сеть,
 * таймаут) считается в предохранителе провайдера; постоянная (400 схема,
 * 401 ключ, 402/403 квота) — нет: она про настройку портала, а не про
 * здоровье провайдера. Запасной провайдер пробуется в обоих случаях.
 */
const STATUS_RE = /\[(\d{3})\]|HTTP (\d{3})|status code (\d{3})/;
const NETWORK_RE =
    /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|UND_ERR|timed out|timeout|aborted/i;

const messageOf = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

/** Код HTTP из текста ошибки клиента; нет кода — null. */
export function llmErrorStatus(error: unknown): number | null {
    const match = messageOf(error).match(STATUS_RE);
    if (!match) return null;
    return Number(match[1] ?? match[2] ?? match[3]);
}

/** Временная ли ошибка: повтор у другого провайдера и счёт в предохранителе уместны. */
export function isTransientLlmError(error: unknown): boolean {
    const status = llmErrorStatus(error);
    if (status !== null) {
        return status >= 500 || status === 429 || status === 408;
    }
    const name =
        typeof error === 'object' && error !== null && 'name' in error
            ? String((error as { name: unknown }).name)
            : '';
    if (name === 'TimeoutError' || name === 'AbortError') return true;
    return NETWORK_RE.test(messageOf(error));
}

/** Короткое описание для логов и сводной ошибки: код, если есть, и начало текста. */
export function describeLlmError(error: unknown): string {
    const status = llmErrorStatus(error);
    const text = messageOf(error).replace(/\s+/g, ' ').trim().slice(0, 200);
    return status === null ? text : `HTTP ${status}: ${text}`;
}
