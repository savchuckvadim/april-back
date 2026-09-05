import { IBXDepartment } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';

/** Целое > 0 из любого сырья Битрикса (число, строка «107»), иначе null. */
export const toPositiveInt = (raw: unknown): number | null => {
    if (raw === null || raw === undefined || raw === '') return null;
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : null;
};

/** Уникальные валидные id с сохранением порядка. */
export const uniqueIds = (
    ids: ReadonlyArray<number | null | undefined>,
): number[] => {
    const result: number[] = [];
    const seen = new Set<number>();
    for (const id of ids) {
        if (id === null || id === undefined || seen.has(id)) continue;
        seen.add(id);
        result.push(id);
    }
    return result;
};

/**
 * Легаси `UF_HEAD` из department.get: число, строка, массив, «0», пусто
 * или отсутствует → список валидных id (обычно один или ни одного).
 */
export const legacyHeadsOf = (dep: IBXDepartment): number[] => {
    const raw: unknown = (dep as unknown as Record<string, unknown>)['UF_HEAD'];
    const values = Array.isArray(raw) ? raw : [raw];
    return uniqueIds(values.map(toPositiveInt));
};

/**
 * `accessCode` узла-отдела новой структуры = 'D' + ID из department.get.
 * Проверено на живом портале 05.09.2026 (КМВ: узел 12, `D620`; все 15
 * отделов 1:1). Команды (`SN…`) и прочие узлы — null.
 */
export const legacyIdFromAccessCode = (
    accessCode: string | null | undefined,
): number | null => {
    const match = /^D(\d+)$/.exec((accessCode ?? '').trim());
    return match ? toPositiveInt(match[1]) : null;
};

/** «ID отдела → руководители» (руководитель первым, потом заместители). */
export type DepartmentHeadsMap = ReadonlyMap<number, readonly number[]>;

/**
 * HEADS = руководители из структуры v3 ∪ легаси UF_HEAD, без дублей,
 * v3 впереди. `UF_HEAD` наружу = `HEADS[0] ?? null` — прежний контракт
 * для потребителей, которые про список ещё не знают.
 */
export const withHeads = (
    departments: IBXDepartment[],
    v3Heads: DepartmentHeadsMap,
): IBXDepartment[] =>
    departments.map(dep => {
        const id = toPositiveInt(dep.ID);
        const fromV3 = id === null ? [] : (v3Heads.get(id) ?? []);
        const heads = uniqueIds([...fromV3, ...legacyHeadsOf(dep)]);
        return { ...dep, HEADS: heads, UF_HEAD: heads[0] ?? null };
    });
