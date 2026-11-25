/** Признак для счётчика: идентификатор и проверка строки. */
export interface FacetSpec<Row> {
    id: string;
    test: (row: Row) => boolean;
}

/**
 * Сколько строк проходит каждый признак — один проход по строкам;
 * признак без строк получает 0.
 */
export function countFacets<Row>(
    rows: readonly Row[],
    facets: readonly FacetSpec<Row>[],
): Record<string, number> {
    const counts = new Map<string, number>(
        facets.map((facet): [string, number] => [facet.id, 0]),
    );
    for (const row of rows) {
        for (const facet of facets) {
            if (facet.test(row)) {
                counts.set(facet.id, (counts.get(facet.id) ?? 0) + 1);
            }
        }
    }
    return Object.fromEntries(counts);
}
