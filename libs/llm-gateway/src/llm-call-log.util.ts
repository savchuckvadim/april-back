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

/** Сбой вызова: прежнее предупреждение шлюза плюс «через N мс» от начала вызова. */
export function describeLlmCallFailure(
    request: Pick<StructuredLlmRequest, 'schemaName' | 'domain'>,
    provider: LlmProviderCode,
    errorText: string,
    elapsedMs: number,
): string {
    return (
        `Провайдер LLM ${provider} не ответил на ${request.schemaName} ` +
        `(${request.domain}) через ${wholeMs(elapsedMs)} мс: ${errorText}`
    );
}
