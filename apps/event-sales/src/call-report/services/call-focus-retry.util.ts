import { LlmUnavailableError } from '@lib/llm-gateway';

/**
 * Один повтор сорвавшегося прохода фокус-разбора (16.11.2026).
 *
 * Проходы разбора идут к модели одновременно. Если из всей волны сорвался
 * ровно один и причина временная (таймаут, 5xx, 429, сеть) — это случайность:
 * остальные дождались ответа, поставщик жив. Такой проход запускается ещё
 * раз, уже после остальных. Сорвалось два и больше — поставщик сейчас не
 * справляется: повтор только добавит сбоев в предохранитель (пять временных
 * сбоев ставят поставщика на паузу — один звонок с повторами набрал бы их в
 * одиночку), звонок дозаполнит догон.
 *
 * Чистая оркестровка без DI: что звать и что считать повторяемым, решает
 * вызывающий.
 */

/** Номер попытки вызова: первая или повтор. */
export type WaveAttempt = 1 | 2;

/** Один вызов волны: ключ и сам вызов. */
export interface WaveCall<K extends string, T> {
    key: K;
    run: (attempt: WaveAttempt) => Promise<T>;
}

/** Итог вызова: ответ или последняя ошибка, и сколько было попыток. */
export type WaveResult<T> =
    | { ok: true; value: T; attempts: WaveAttempt }
    | { ok: false; error: unknown; attempts: WaveAttempt };

/**
 * Запускает вызовы одновременно; если сорвался ровно один и ошибка
 * повторяемая — повторяет его один раз. Сам не бросает.
 */
export async function runWaveWithRetry<K extends string, T>(
    calls: readonly WaveCall<K, T>[],
    isRetryable: (error: unknown) => boolean,
    onRetry?: (key: K, error: unknown) => void,
): Promise<Map<K, WaveResult<T>>> {
    const settled = await Promise.allSettled(calls.map(call => call.run(1)));
    const results = new Map<K, WaveResult<T>>();
    calls.forEach((call, index) => {
        const outcome = settled[index];
        results.set(
            call.key,
            outcome.status === 'fulfilled'
                ? { ok: true, value: outcome.value, attempts: 1 }
                : { ok: false, error: outcome.reason as unknown, attempts: 1 },
        );
    });

    const failed = calls.filter(call => !results.get(call.key)?.ok);
    if (failed.length !== 1) return results;
    const [lone] = failed;
    const first = results.get(lone.key);
    if (!first || first.ok || !isRetryable(first.error)) return results;

    onRetry?.(lone.key, first.error);
    try {
        results.set(lone.key, {
            ok: true,
            value: await lone.run(2),
            attempts: 2,
        });
    } catch (error) {
        results.set(lone.key, { ok: false, error, attempts: 2 });
    }
    return results;
}

/** Что нужно, чтобы закрыть сорвавшийся вызов: журнал и отложенная тревога. */
export interface WaveSettleDeps {
    warn(message: string): void;
    /** Тревога «не ответил никто» по ошибке, чью тревогу шлюз отложил. */
    reportExhausted(
        error: LlmUnavailableError,
        request: { schemaName: string; domain: string },
    ): Promise<void>;
}

/** О каком вызове речь — для журнала и тревоги. */
export interface WaveCallInfo {
    /** «Фокус «форма разговора»» или «Синтез фокус-разбора». */
    title: string;
    schemaName: string;
    domain: string;
}

/**
 * Ответ вызова или null, если он сорвался. Сбой пишется в журнал и в
 * `failures`. Тревога первой попытки была отложена (шлюз не знал, будет ли
 * повтор): раз повтора не было — она уходит сейчас; после повтора шлюз
 * тревожит сам.
 */
export async function settleWaveCall<T>(
    result: WaveResult<T> | undefined,
    info: WaveCallInfo,
    deps: WaveSettleDeps,
    failures?: unknown[],
): Promise<T | null> {
    if (!result) return null;
    if (result.ok) return result.value;
    failures?.push(result.error);
    const reason =
        result.error instanceof Error
            ? result.error.message
            : String(result.error);
    deps.warn(
        `${info.title} не выполнен (${info.domain})` +
            (result.attempts === 2 ? ' и после повтора' : '') +
            `: ${reason}`,
    );
    if (result.attempts === 1 && result.error instanceof LlmUnavailableError) {
        await deps.reportExhausted(result.error, {
            schemaName: info.schemaName,
            domain: info.domain,
        });
    }
    return null;
}
