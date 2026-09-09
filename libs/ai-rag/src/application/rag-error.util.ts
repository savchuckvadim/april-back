/**
 * Читаемая причина сбоя обращения к провайдеру знаний.
 *
 * ЗАЧЕМ. Ошибки приходят от axios-подобных клиентов (GigaChat, эмбеддинги)
 * и полем `message` несут ОБЪЕКТ, а не строку. Прямая подстановка в шаблон
 * давала в проде запись «Контекст знаний kind=recomendation недоступен:
 * [object Object]» — то есть факт сбоя виден, а причина нет. Здесь ошибка
 * приводится к короткой строке и, где возможно, к машинному коду, по
 * которому оповещения группируются ограничителем.
 */

/** Коды, по которым различаем сбои провайдера знаний. */
export const RAG_ERROR_CODES = [
    'tokens-limit',
    'unauthorized',
    'rate-limit',
    'server',
    'network',
    'unknown',
] as const;
export type RagErrorCode = (typeof RAG_ERROR_CODES)[number];

export interface RagErrorInfo {
    /** Код для группировки оповещений. */
    code: RagErrorCode;
    /** HTTP-статус, если провайдер его вернул. */
    status: number | null;
    /** Короткий текст для лога: без стека и без дампа объекта. */
    text: string;
}

const MAX_TEXT_LENGTH = 300;

/** Значение по пути объекта без приведения к `any`. */
function pick(source: unknown, ...path: string[]): unknown {
    let current: unknown = source;
    for (const key of path) {
        if (typeof current !== 'object' || current === null) return undefined;
        current = (current as Record<string, unknown>)[key];
    }
    return current;
}

function toText(value: unknown): string | null {
    if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
    }
    if (typeof value === 'number') return String(value);
    return null;
}

function statusOf(error: unknown): number | null {
    for (const path of [
        ['status'],
        ['response', 'status'],
        ['data', 'status'],
        ['response', 'data', 'status'],
    ]) {
        const value = pick(error, ...path);
        if (typeof value === 'number') return value;
    }
    return null;
}

function messageOf(error: unknown): string {
    for (const path of [
        ['data', 'message'],
        ['response', 'data', 'message'],
        ['response', 'statusText'],
        ['message'],
    ]) {
        const text = toText(pick(error, ...path));
        if (text) return text;
    }
    if (error instanceof Error && error.message) return error.message;
    return 'причина не определена';
}

/** Код по статусу и тексту: сначала статус, потом характерные слова. */
function codeOf(status: number | null, text: string): RagErrorCode {
    const lower = text.toLowerCase();
    if (status === 413 || lower.includes('tokens limit')) return 'tokens-limit';
    if (status === 401 || status === 403) return 'unauthorized';
    if (status === 429) return 'rate-limit';
    if (status !== null && status >= 500) return 'server';
    if (
        lower.includes('timeout') ||
        lower.includes('econn') ||
        lower.includes('socket hang up') ||
        lower.includes('network')
    ) {
        return 'network';
    }
    return 'unknown';
}

/** Разбор ошибки провайдера знаний в код, статус и короткий текст. */
export function describeRagError(error: unknown): RagErrorInfo {
    const status = statusOf(error);
    const message = messageOf(error).slice(0, MAX_TEXT_LENGTH);
    const code = codeOf(status, message);
    const text = status === null ? message : `HTTP ${status}: ${message}`;
    return { code, status, text };
}
