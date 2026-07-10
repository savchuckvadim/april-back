/**
 * Batch в REST 3.0.
 *
 * Эндпоинт `/batch` существует на порталах (виден в OpenAPI-спеке),
 * принимает JSON-массив шагов с подстановкой результатов предыдущих
 * шагов, но на момент написания НЕ документирован ни в markdown-доках,
 * ни в самой спеке (schema: {type: object}, responses: []).
 *
 * Типы ниже — задел под будущую реализацию stateless-вызова
 * `callBatch(steps)`. Накопительного batch-стейта (как в v1)
 * в этой библиотеке не будет by design.
 */
export interface IBitrixV3BatchStep {
    /** Имя метода REST 3.0, например `humanresources.node.get` */
    method: string;
    /** Параметры метода */
    params: Record<string, unknown>;
}
