import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';

/**
 * Контроль ПОЛНОТЫ батч-результата Битрикса.
 *
 * Смысл: под нагрузкой rate-limiter дропает вызовы, и часть команд батча
 * тихо исчезает из ответа — счётчики отчёта «проседают» без единой ошибки
 * (инцидент 2026-07-27/28: «наборы» 1000+ → 72 → 9 при истинных 88).
 * Strict-режим callBatchWithConcurrency ловит упавшие ЧАНКИ; этот модуль
 * добивает вторую дыру — ПОКОМАНДНЫЕ ошибки (result_error) и любое иное
 * отсутствие ожидаемого ключа: отчёт с недостающими командами не отдаётся.
 */

/** Батч вернул не все ожидаемые команды — отчёт был бы недостоверным. */
export class IncompleteBatchError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'IncompleteBatchError';
    }
}

export interface MergedBatchResults {
    /** cmdKey → результат команды (слито по всем чанкам). */
    result: Record<string, unknown>;
    /** cmdKey → total команды (счётчики result_total). */
    totals: Record<string, unknown>;
    /** cmdKey → ошибка команды (result_error). */
    errors: Record<string, unknown>;
}

/**
 * Сливает чанки батча в плоские словари. result_total/result_error в
 * рантайме — словари по cmdKey (типы интерфейса неточны), приводим через
 * unknown.
 */
export function mergeBatchResults(
    results: readonly IBitrixBatchResponseResult[],
): MergedBatchResults {
    const merged: MergedBatchResults = { result: {}, totals: {}, errors: {} };
    for (const chunk of results) {
        if (!chunk || typeof chunk !== 'object') continue;
        Object.assign(
            merged.result,
            (chunk.result ?? {}) as Record<string, unknown>,
        );
        Object.assign(
            merged.totals,
            (chunk.result_total ?? {}) as unknown as Record<string, unknown>,
        );
        Object.assign(
            merged.errors,
            (chunk.result_error ?? {}) as unknown as Record<string, unknown>,
        );
    }
    return merged;
}

/**
 * Бросает IncompleteBatchError, если какой-то из ожидаемых cmdKey
 * отсутствует в результатах. Детали result_error по пропавшим ключам
 * включаются в сообщение — ошибка диагностируемая, а не «чего-то нет».
 */
export function assertBatchComplete(
    merged: MergedBatchResults,
    expectedKeys: readonly string[],
    context: string,
): void {
    const missing = expectedKeys.filter(key => !(key in merged.result));
    if (!missing.length) return;

    const details = missing
        .slice(0, 5)
        .map(key => {
            const error = merged.errors[key];
            return error ? `${key}: ${JSON.stringify(error)}` : key;
        })
        .join('; ');

    throw new IncompleteBatchError(
        `Битрикс не вернул ${missing.length} из ${expectedKeys.length} ` +
            `команд (${context}): ${details}` +
            (missing.length > 5 ? ` и ещё ${missing.length - 5}` : '') +
            '. Отчёт неполный — данные не отдаём, повторите запрос.',
    );
}
