/**
 * РУКОВОДИТЕЛИ СОТРУДНИКА по снимку структуры отделов (bx-department).
 *
 * Общее для сводок аудита сделок (deal-audit) и оповещений входа о
 * повторной заявке (lead-to-work): «кому из руководства сообщить о работе
 * этого сотрудника». Чистые функции, без запросов к порталу.
 */

/** Отдел в объёме, который нужен поиску руководителя (структурно = IBXDepartment). */
export interface DepartmentLike {
    readonly ID: number | string;
    readonly PARENT?: number | string | null;
    /** Руководитель + заместители (bx-department: структура v3 ∪ UF_HEAD). */
    readonly HEADS?: readonly (number | string)[] | null;
    readonly UF_HEAD?: number | string | null;
    /**
     * `ID` необязателен намеренно: `IBXUser` из Битрикса объявляет его
     * опциональным, и без этого послабления структурная совместимость с
     * ответом `department.get` не складывается.
     */
    readonly USERS?: readonly { readonly ID?: number | string }[] | null;
}

/** Ограничитель подъёма по дереву отделов — защита от цикла PARENT. */
const CLIMB_LIMIT = 10;

export const toId = (raw: unknown): number | null => {
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
};

/** Руководитель и заместители отдела: HEADS, а без них — легаси UF_HEAD. */
export const headsOf = (department: DepartmentLike): number[] => {
    const list = department.HEADS?.length
        ? department.HEADS
        : [department.UF_HEAD];
    const result: number[] = [];
    for (const raw of list) {
        const id = toId(raw);
        if (id !== null && !result.includes(id)) result.push(id);
    }
    return result;
};

/**
 * «Сотрудник → его руководители (РОП и заместители)».
 *
 * Подъём по `PARENT` обязателен: у подотдела («Группа 1») руководителя
 * часто нет вовсе, а у самого РОПа его отдел возглавляет он сам — без
 * подъёма сводка по своим сотрудникам уходила бы ему же, и «чужой»
 * руководитель уровнем выше никогда бы её не увидел.
 *
 * Сам сотрудник из своего списка руководителей исключается: иначе
 * менеджер получил бы два одинаковых уведомления — своё и «как РОП».
 */
export const buildHeadsByUser = (
    departments: readonly DepartmentLike[],
): Map<number, number[]> => {
    const byId = new Map<number, DepartmentLike>();
    for (const department of departments) {
        const id = toId(department.ID);
        if (id !== null) byId.set(id, department);
    }

    const result = new Map<number, number[]>();
    for (const department of departments) {
        for (const user of department.USERS ?? []) {
            const userId = toId(user?.ID);
            if (userId === null || result.has(userId)) continue;
            result.set(userId, climbForHeads(department, byId, userId));
        }
    }
    return result;
};

/**
 * Руководители НЕСКОЛЬКИХ сотрудников одним списком, без повторов: общий
 * РОП двух менеджеров получает одно сообщение, а не два. Сотрудник вне
 * снимка (уволен, другой отдел) руководителей не добавляет.
 */
export const headsOfUsers = (
    headsByUser: ReadonlyMap<number, readonly number[]>,
    userIds: readonly number[],
): number[] => {
    const result: number[] = [];
    for (const userId of userIds) {
        for (const headId of headsByUser.get(userId) ?? []) {
            if (!result.includes(headId)) result.push(headId);
        }
    }
    return result;
};

const climbForHeads = (
    start: DepartmentLike,
    byId: ReadonlyMap<number, DepartmentLike>,
    userId: number,
): number[] => {
    let current: DepartmentLike | undefined = start;
    for (let step = 0; step < CLIMB_LIMIT && current; step += 1) {
        const heads = headsOf(current).filter(id => id !== userId);
        if (heads.length) return heads;
        const parentId = toId(current.PARENT);
        current = parentId === null ? undefined : byId.get(parentId);
    }
    return [];
};
