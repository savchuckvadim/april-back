import {
    LlmProviderPausedError,
    LlmUnavailableError,
} from './llm-unavailable.error';

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
/**
 * Признаки сетевого обрыва. «terminated» и «other side closed» — fetch Node
 * (undici), когда соединение рвётся уже при чтении тела ответа: код сокета
 * (UND_ERR_SOCKET) лежит тогда не в тексте, а в `cause`.
 */
const NETWORK_RE =
    /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|UND_ERR|timed out|timeout|aborted|terminated|other side closed/i;

/** Сколько звеньев `cause` смотреть: обрыв undici лежит на втором-третьем. */
const MAX_CAUSE_DEPTH = 3;

const messageOf = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

/** Поле ошибки (name, code, cause); нет — undefined. */
const fieldOf = (error: unknown, field: 'name' | 'code' | 'cause'): unknown =>
    typeof error === 'object' && error !== null && field in error
        ? (error as Record<typeof field, unknown>)[field]
        : undefined;

/**
 * Сетевой обрыв или таймаут — по имени, коду и тексту самой ошибки и её
 * причин (`cause`): обёртки клиентов кладут исходную ошибку сокета туда.
 */
function isNetworkFailure(error: unknown, depth = 0): boolean {
    if (error === undefined || error === null || depth > MAX_CAUSE_DEPTH) {
        return false;
    }
    const name = fieldOf(error, 'name');
    if (name === 'TimeoutError' || name === 'AbortError') return true;
    const code = fieldOf(error, 'code');
    if (typeof code === 'string' && NETWORK_RE.test(code)) return true;
    if (NETWORK_RE.test(messageOf(error))) return true;
    return isNetworkFailure(fieldOf(error, 'cause'), depth + 1);
}

/** Код HTTP из текста ошибки клиента; нет кода — null. */
export function llmErrorStatus(error: unknown): number | null {
    const match = messageOf(error).match(STATUS_RE);
    if (!match) return null;
    return Number(match[1] ?? match[2] ?? match[3]);
}

/**
 * Временная ли ошибка: повтор у другого провайдера и счёт в предохранителе
 * уместны. Поставщик на паузе, к которому вызов не пустили, — временная.
 * Сводная ошибка шлюза (отказали все поставщики) — см. isTransientUnavailable.
 */
export function isTransientLlmError(error: unknown): boolean {
    if (error instanceof LlmUnavailableError) {
        return isTransientUnavailable(error);
    }
    if (error instanceof LlmProviderPausedError) return true;
    const status = llmErrorStatus(error);
    if (status !== null) {
        return status >= 500 || status === 429 || status === 408;
    }
    return isNetworkFailure(error);
}

/**
 * Сводная ошибка шлюза временная, если временно сорвался ОСНОВНОЙ
 * поставщик — первый настроенный в порядке (11.11.2026). Сейчас повтор,
 * скорее всего, сорвётся так же, позже — пройдёт. Запасной основного не
 * перекрывает: 429 бесплатного Groq не делает временным негодный ответ
 * VibeCode, а 413 запасного — постоянным таймаут VibeCode. Решает последняя
 * попытка основного (после паузы его могут позвать пробой); попытки нет —
 * его не пустили (пауза, проба уже шла), это временно. Основного нет
 * (ошибку собрали без него) — временная, если временно сорвался хоть кто-то.
 * Текст ошибки не разбирается.
 */
function isTransientUnavailable(error: LlmUnavailableError): boolean {
    if (error.primary === null) {
        return error.failures.some(failure => failure.transient);
    }
    const own = error.failures.filter(
        failure => failure.provider === error.primary,
    );
    const last = own[own.length - 1];
    return last ? last.transient : true;
}

/** Короткое описание для логов и сводной ошибки: код, если есть, и начало текста. */
export function describeLlmError(error: unknown): string {
    const status = llmErrorStatus(error);
    const text = messageOf(error).replace(/\s+/g, ' ').trim().slice(0, 200);
    return status === null ? text : `HTTP ${status}: ${text}`;
}
