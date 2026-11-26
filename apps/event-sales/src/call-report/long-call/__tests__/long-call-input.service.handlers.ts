import {
    defaultAnswer,
    isPartCall,
    isSummaryCall,
    partNumberOf,
    permanentError,
    type ModelCall,
    type ModelHandler,
} from './long-call-input.service.fixture';

/**
 * Готовые обработчики подставного шлюза для тестов повторов и отказов:
 * испортить ответ на одну часть, на несколько частей или на сводку.
 */

/** Часть, на которой проверяются повторы (вторая из частей). */
export const TARGET_PART = 2;

/** Сколько раз к модели пришли за конспектом части. */
export const partCallCount = (
    calls: readonly ModelCall[],
    number: number,
): number =>
    calls.filter(call => isPartCall(call) && partNumberOf(call) === number)
        .length;

/** Обработчик: на часть TARGET_PART отвечает `forPart(попытка)`, остальное — как обычно. */
export function targetPartHandler(
    forPart: (attempt: number) => unknown,
): ModelHandler {
    let attempt = 0;

    return (call, index) => {
        if (isPartCall(call) && partNumberOf(call) === TARGET_PART) {
            attempt += 1;

            return forPart(attempt);
        }

        return defaultAnswer(call, index);
    };
}

/** Обработчик: у частей из списка конспект не получается (постоянная ошибка). */
export const failingParts =
    (failing: readonly number[]): ModelHandler =>
    (call, index) => {
        if (isPartCall(call) && failing.includes(partNumberOf(call))) {
            throw permanentError();
        }

        return defaultAnswer(call, index);
    };

/** Обработчик: на запрос сводки отвечает `forSummary(попытка)`. */
export function summaryHandler(
    forSummary: (attempt: number) => unknown,
): ModelHandler {
    let attempt = 0;

    return (call, index) => {
        if (!isSummaryCall(call)) return defaultAnswer(call, index);
        attempt += 1;

        return forSummary(attempt);
    };
}
