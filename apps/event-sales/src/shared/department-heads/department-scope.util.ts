import { DepartmentLike, headsOf, toId } from './department-heads.util';

/**
 * «СВОЙ ОТДЕЛ» получателя сводки или отчёта — сотрудники, чью работу ему
 * показывают (настройки «… по своему отделу — кому» у аудита сделок и у
 * отчёта по дублям).
 *
 * Свой отдел — тот, где получатель числится или которым руководит; к нему
 * добавляются ВСЕ подотделы вниз по PARENT среди загруженных отделов
 * структуры продаж. Зачем: на garant ответственный за направление сидит в
 * отделе «Глава …», а менеджеры — в ОП и группах уровнем ниже; руководителем
 * этих ОП в Битриксе он часто не отмечен, и «Сводку РОПу» не получает.
 *
 * Сам получатель в список не входит: свою работу он видит в личной
 * сводке, а не в сводке «по отделу».
 *
 * Переехала из deal-audit (01.10.2026): тот же «свой отдел» нужен отчёту
 * по дублям сделок; deal-audit реэкспортирует её без изменений.
 */
export const departmentScopeOf = (
    departments: readonly DepartmentLike[],
    userId: number,
): Set<number> => {
    const childrenOf = new Map<number, DepartmentLike[]>();
    for (const department of departments) {
        const parentId = toId(department.PARENT);
        if (parentId === null) continue;
        const list = childrenOf.get(parentId) ?? [];
        list.push(department);
        childrenOf.set(parentId, list);
    }

    const isMember = (department: DepartmentLike): boolean =>
        (department.USERS ?? []).some(user => toId(user?.ID) === userId) ||
        headsOf(department).includes(userId);

    const visited = new Set<number>();
    const queue = departments.filter(isMember);
    const employees = new Set<number>();
    // Очередь растёт по ходу обхода: подотделы дописываются в хвост.
    for (let index = 0; index < queue.length; index += 1) {
        const department = queue[index];
        const id = toId(department.ID);
        if (id === null || visited.has(id)) continue;
        visited.add(id);
        for (const user of department.USERS ?? []) {
            const employeeId = toId(user?.ID);
            if (employeeId !== null && employeeId !== userId) {
                employees.add(employeeId);
            }
        }
        queue.push(...(childrenOf.get(id) ?? []));
    }
    return employees;
};
