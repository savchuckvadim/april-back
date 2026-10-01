/**
 * «САМАЯ СВЕЖАЯ» СДЕЛКА КЛИЕНТА — одно правило на вход повторной заявки
 * (к ней присоединяется заявка при нескольких открытых сделках) и на
 * еженедельный отчёт по дублям (колонка «Самая свежая»): иначе отчёт
 * показывал бы не ту сделку, куда на деле уйдёт следующая заявка.
 *
 * Позже изменённая (DATE_MODIFY) — первой; без даты — в конец; при
 * равенстве — больший ID, то есть созданная позже.
 */
export interface DealFreshness {
    /** DATE_MODIFY, ms; null — даты нет. */
    readonly modifiedAtMs: number | null;
    readonly id: number;
}

const timeOf = (deal: DealFreshness): number =>
    deal.modifiedAtMs !== null && Number.isFinite(deal.modifiedAtMs)
        ? deal.modifiedAtMs
        : -Infinity;

/** Компаратор для sort: свежие — первыми. */
export const compareFreshness = (
    a: DealFreshness,
    b: DealFreshness,
): number => {
    const left = timeOf(a);
    const right = timeOf(b);
    if (left !== right) return right > left ? 1 : -1;
    return b.id - a.id;
};
