/** all — все условия группы; any — хотя бы одно. */
export type ConditionGroupMode = 'all' | 'any';

export interface ConditionGroup<Row> {
    mode: ConditionGroupMode;
    tests: readonly ((row: Row) => boolean)[];
}

/** Пустая группа (без условий) проходит всегда — и в режиме all, и в any. */
function matchesGroup<Row>(row: Row, group: ConditionGroup<Row>): boolean {
    if (group.tests.length === 0) return true;
    return group.mode === 'all'
        ? group.tests.every(test => test(row))
        : group.tests.some(test => test(row));
}

/** Строка проходит, если проходит КАЖДУЮ группу. Пустая группа (без условий) строку пропускает. */
export function matchesGroups<Row>(
    row: Row,
    groups: readonly ConditionGroup<Row>[],
): boolean {
    return groups.every(group => matchesGroup(row, group));
}
