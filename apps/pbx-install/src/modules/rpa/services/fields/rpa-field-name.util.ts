/**
 * Имена RPA-полей в pbx исторически лежат в двух видах: короткий код
 * (`RPA_CRM_BASE_DEAL`, так на боевом gsr) и полное имя Bitrix
 * (`UF_RPA_1_RPA_CRM_BASE_DEAL`). Сверку с Bitrix ведём по суффиксу,
 * чтобы мониторинг одинаково видел оба варианта.
 */
export const stripRpaFieldPrefix = (name: string | null | undefined): string =>
    String(name ?? '').replace(/^UF_RPA_\d+_/, '');

export const isSameRpaField = (
    a: string | null | undefined,
    b: string | null | undefined,
): boolean => {
    const left = stripRpaFieldPrefix(a);
    return left.length > 0 && left === stripRpaFieldPrefix(b);
};
