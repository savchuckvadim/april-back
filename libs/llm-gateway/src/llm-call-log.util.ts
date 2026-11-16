import type {
    LlmProviderCode,
    StructuredLlmRequest,
    StructuredLlmResponse,
} from './structured-llm.types';

/**
 * Строки журнала каждого вызова модели (11.11.2026). Разбор звонка — 3–4
 * фокус-прохода и синтез, разборов разом до 9, запросов к модели до 27–36
 * на один ключ портала: без замера на каждый вызов не отличить «ждал
 * очереди» от «модель долго писала». Шлюз только засекает время, строки
 * собираются здесь.
 */

/** Что журналу нужно из запроса. */
type LoggedLlmRequest = Pick<
    StructuredLlmRequest,
    'schemaName' | 'domain' | 'systemPrompt' | 'userContent'
>;

/** Миллисекунды для журнала: целые и не меньше нуля (часы могли сдвинуться); не число — 0. */
const wholeMs = (value: number | undefined): number =>
    value !== undefined && Number.isFinite(value)
        ? Math.max(0, Math.round(value))
        : 0;

/** Токены или «нет», если провайдер поле не вернул. */
const tokensOf = (value: number | null): string =>
    value === null ? 'нет' : String(value);

/**
 * Удачный вызов: провайдер, схема, домен, время ответа, ожидание слота
 * (только когда адаптер его сообщил и оно больше нуля), размер входа в
 * знаках (системный промпт + контент) и токены промпта и ответа.
 *
 * `elapsedMs` — замер шлюза вокруг `adapter.complete`; ожидание слота в
 * него входит, поэтому время ответа печатается за вычетом `queueMs`.
 */
export function describeLlmCallSuccess(
    request: LoggedLlmRequest,
    provider: LlmProviderCode,
    response: Pick<StructuredLlmResponse, 'usage' | 'queueMs'>,
    elapsedMs: number,
): string {
    const queueMs = wholeMs(response.queueMs);
    const waited = queueMs > 0 ? `, ждал слота ${queueMs} мс` : '';
    const inputChars = request.systemPrompt.length + request.userContent.length;
    const { promptTokens, completionTokens } = response.usage;
    return (
        `LLM ${provider} ${request.schemaName} (${request.domain}): ` +
        `ответ за ${wholeMs(elapsedMs - queueMs)} мс${waited}, ` +
        `вход ${inputChars} знаков, ` +
        `токены промпта ${tokensOf(promptTokens)}, ` +
        `ответа ${tokensOf(completionTokens)}`
    );
}

/**
 * Сбой вызова: прежнее предупреждение шлюза плюс «через N мс» — сколько
 * поставщик молчал после отправки запроса. `elapsedMs` — замер шлюза от
 * начала вызова; ожидание слота до отправки (`queueMs`) из него вычитается
 * и печатается отдельно, иначе «через» врёт про скорость поставщика.
 */
export function describeLlmCallFailure(
    request: Pick<StructuredLlmRequest, 'schemaName' | 'domain'>,
    provider: LlmProviderCode,
    errorText: string,
    elapsedMs: number,
    queueMs?: number,
): string {
    const queue = wholeMs(queueMs);
    const waited = queue > 0 ? ` (ждал слота ${queue} мс)` : '';
    return (
        `Провайдер LLM ${provider} не ответил на ${request.schemaName} ` +
        `(${request.domain}) через ${wholeMs(elapsedMs - queue)} мс${waited}: ${errorText}`
    );
}

/**
 * Замер одного вызова модели в поле `meta` журнала (16.11.2026). Строка
 * журнала читается глазами, а `meta.llm` — запросом: «сколько в среднем
 * отвечает проход call_focus_movement и сколько токенов пишет» решает,
 * делить ли проход, без разбора текста регулярками. В ClickHouse:
 * `JSONExtractInt(meta, 'llm', 'ms')`, `JSONExtractString(meta, 'llm', 'schema')`.
 */
export interface LlmCallMeta {
    provider: LlmProviderCode;
    /** Имя схемы — оно же проход разбора (`call_focus_movement`). */
    schema: string;
    domain: string;
    /** Ответил ли поставщик. */
    ok: boolean;
    /** Время ответа (сбой — молчания) поставщика без ожидания слота, мс. */
    ms: number;
    /** Ожидание свободного слота перед отправкой, мс. */
    queueMs: number;
    /** Размер входа: системный промпт + контент, знаков. */
    inputChars: number;
    promptTokens: number | null;
    completionTokens: number | null;
    /** Фактическая модель; сбой или провайдер не сообщил — null. */
    model: string | null;
}

/** Что из ответа нужно замеру; сбой — ответа нет. */
type MeasuredAnswer = Pick<StructuredLlmResponse, 'usage' | 'model'>;

/**
 * Поля `meta` для строки журнала вызова. `elapsedMs` — замер шлюза от начала
 * вызова, `queueMs` — ожидание слота внутри него (как в строках выше).
 */
export function llmCallMeta(
    request: LoggedLlmRequest,
    provider: LlmProviderCode,
    elapsedMs: number,
    queueMs: number | undefined,
    answer: MeasuredAnswer | null,
): { llm: LlmCallMeta } {
    const queue = wholeMs(queueMs);
    return {
        llm: {
            provider,
            schema: request.schemaName,
            domain: request.domain,
            ok: answer !== null,
            ms: wholeMs(elapsedMs - queue),
            queueMs: queue,
            inputChars:
                request.systemPrompt.length + request.userContent.length,
            promptTokens: answer?.usage.promptTokens ?? null,
            completionTokens: answer?.usage.completionTokens ?? null,
            model: answer?.model ?? null,
        },
    };
}

/** Размер входа запроса, знаков: системный промпт + контент (как в журнале). */
export const llmInputChars = (request: LoggedLlmRequest): number =>
    request.systemPrompt.length + request.userContent.length;

/**
 * Почему поставщик пропущен по размеру (16.11.2026) — в сводную ошибку и
 * тревогу. Не «не ответил»: поставщик исправен, запрос больше его предела
 * (бесплатный Groq отвечает 413 на разборы длинных звонков).
 */
export const describeLlmTooLarge = (request: LoggedLlmRequest): string =>
    `исправен, но запрос такого размера (${llmInputChars(request)} знаков) не принимает`;

/** Строка журнала: поставщик ответил 413 — размер запомнен, повторов не будет. */
export const describeLlmTooLargeCall = (
    request: LoggedLlmRequest,
    provider: LlmProviderCode,
): string =>
    `LLM ${provider} ${request.schemaName} (${request.domain}): ` +
    `запрос ${llmInputChars(request)} знаков поставщик не принимает (HTTP 413) — ` +
    'пропущен, такие запросы час к нему не уходят';

/**
 * Текст тревоги «не ответил никто». Когда кто-то из поставщиков пропущен по
 * размеру, заголовок не говорит «отказали все»: запасной исправен, он просто
 * не берёт запрос такого размера — чинить его не нужно.
 */
export function describeLlmExhausted(
    request: Pick<StructuredLlmRequest, 'schemaName' | 'domain'>,
    notes: readonly string[],
    hasTooLarge: boolean,
): string {
    const head = `ПОПЫТКИ ИСЧЕРПАНЫ: LLM не ответила на ${request.schemaName} (${request.domain})`;
    const reasons = notes.join('; ');
    return hasTooLarge
        ? `${head}: ${reasons}`
        : `${head} — отказали все поставщики: ${reasons}`;
}
