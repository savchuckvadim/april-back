/**
 * Метрики контакта для смарт-отчёта (аналоги legacy
 * `calc_planned_communications` / `calc_degree_needs`).
 *
 * Значения портальных полей UF_CRM_ORK_CALL_FREQUENCY / UF_CRM_ORK_NEEDS
 * приходят числами (или строками). Приводим к числу безопасно; нечисловые/
 * пустые значения трактуем как 0 — так же, как legacy суммировал их в планы.
 */
export function calcPlannedCommunications(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

export function calcDegreeNeeds(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}
