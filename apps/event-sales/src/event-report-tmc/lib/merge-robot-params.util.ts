/**
 * Параметры робота приходят двумя путями сразу: строкой запроса (адрес
 * робота с подстановками) и телом (блок `auth` исходящего вебхука). После
 * ValidationPipe каждый путь — экземпляр DTO, в котором ВСЕ объявленные
 * поля существуют, незаполненные — как `undefined`. Простой spread
 * «тело поверх строки» затирал ими значения из адреса, и робот получал
 * «Не передана ТМЦ-сделка» при заполненном `tmcDealId` (gsr, 05–06.11.2026).
 *
 * Берём из тела только то, что в нём действительно есть.
 */
export const mergeRobotParams = <T extends object>(query: T, body: T): T => {
    const merged: Record<string, unknown> = {
        ...(query as Record<string, unknown>),
    };
    for (const [key, value] of Object.entries(
        body as Record<string, unknown>,
    )) {
        if (value !== undefined) merged[key] = value;
    }
    return merged as T;
};
