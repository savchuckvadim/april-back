import type { BitrixService } from '@lib/bitrix';
import type { IBitrixBatchResponseResult } from '@lib/bitrix/core/interface/bitrix-api-http.intterface';

/** Ответ пачки одной картой: значения и ошибки по ключам команд. */
export interface SupportBatchOutcome {
    results: Record<string, unknown>;
    errors: Record<string, string>;
}

const describeError = (error: unknown): string => {
    if (error && typeof error === 'object') {
        const { error: code, error_description: text } = error as {
            error?: unknown;
            error_description?: unknown;
        };
        if (code || text) return [code, text].filter(Boolean).join(': ');
    }
    return JSON.stringify(error ?? null).slice(0, 200);
};

/** Склейка чанков пачки: результаты и ошибки команд по ключам. */
export function collectBatchOutcome(
    responses: readonly IBitrixBatchResponseResult[],
): SupportBatchOutcome {
    const outcome: SupportBatchOutcome = { results: {}, errors: {} };
    for (const response of responses) {
        Object.assign(outcome.results, response?.result ?? {});
        const errors = response?.result_error;
        if (errors && !Array.isArray(errors)) {
            for (const [key, error] of Object.entries(errors)) {
                outcome.errors[key] = describeError(error);
            }
        }
    }
    return outcome;
}

/**
 * Выполнить накопленные команды пачки ЭТОГО инстанса и разобрать ответ.
 * strict: упавший чанк бросает исключение — неполный просмотр линии хуже
 * пропущенного (молча потерянный диалог выглядел бы как «все ответили»).
 */
export async function runSupportBatch(
    bitrix: BitrixService,
): Promise<SupportBatchOutcome> {
    const responses = await bitrix.api.callBatchWithConcurrency(1, {
        strict: true,
    });
    return collectBatchOutcome(responses);
}
