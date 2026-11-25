/**
 * Страница списка: номер с 1; за пределами списка — пустой массив.
 * Номер или размер страницы меньше 1 — тоже пусто: отрицательный номер
 * иначе дал бы срез из середины списка.
 */
export function pageOf<T>(
    rows: readonly T[],
    page: number,
    pageSize: number,
): T[] {
    if (page < 1 || pageSize < 1) return [];
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
}
