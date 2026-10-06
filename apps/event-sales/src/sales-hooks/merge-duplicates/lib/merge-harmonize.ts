/**
 * Подготовка карточек к штатному объединению Битрикса, когда оно ответило
 * CONFLICT (владелец, 05.10.2026: «надо по-любому объединять все данные, по
 * возможности дополнять»).
 *
 * Принудительного режима у `crm.entity.mergeBatch` нет: при разных значениях
 * одного поля он отказывает. Поэтому расхождения снимаются заранее:
 *  - пустые поля главной карточки дополняются значениями дублей;
 *  - множественные поля объединяются (ничего не теряется);
 *  - комментарии склеиваются;
 *  - в остальных полях главная карточка остаётся как есть, а значение дубля
 *    приводится к её значению. Само значение дубля не теряется — оно уходит
 *    в заметку (см. MergeConflictNote) и пишется в ленту главной карточки.
 *
 * Чистые правила, без Битрикса.
 */

export type MergeRow = Record<string, unknown>;

export interface MergeVictimRow {
    id: number;
    row: MergeRow;
}

/** Значение дубля, уступившее главной карточке. */
export interface MergeConflictNote {
    victimId: number;
    field: string;
    victimValue: string;
    keptValue: string;
}

export interface MergeHarmonization {
    /** Чем дополнить главную карточку. */
    survivorPatch: MergeRow;
    /** Что поменять у каждого дубля, чтобы Битрикс не видел расхождений. */
    victimPatches: Map<number, MergeRow>;
    notes: MergeConflictNote[];
}

/**
 * Поля, которые не трогаем: служебные, ответственный, стадии и статусы
 * (их смена запускает роботы и бизнес-процессы портала) и привязки — их
 * объединение Битрикс делает сам.
 */
const SKIPPED_FIELDS = new Set([
    'ID',
    'DATE_CREATE',
    'DATE_MODIFY',
    'CREATED_BY_ID',
    'MODIFY_BY_ID',
    'ASSIGNED_BY_ID',
    'LAST_ACTIVITY_TIME',
    'LAST_ACTIVITY_BY',
    'LAST_COMMUNICATION_TIME',
    'MOVED_BY_ID',
    'MOVED_TIME',
    'ORIGINATOR_ID',
    'ORIGIN_ID',
    'ORIGIN_VERSION',
    'CATEGORY_ID',
    'STAGE_ID',
    'STAGE_SEMANTIC_ID',
    'STATUS_ID',
    'STATUS_SEMANTIC_ID',
    'CLOSED',
    'COMPANY_ID',
    'CONTACT_ID',
    'LEAD_ID',
    'QUOTE_ID',
]);

/** Поле, которое склеивается, а не выбирается. */
const CONCATENATED_FIELD = 'COMMENTS';

const isSkipped = (field: string): boolean =>
    SKIPPED_FIELDS.has(field) ||
    /^(IS|HAS)_/.test(field) ||
    field.endsWith('_LOC_ADDR_ID');

type Primitive = string | number | boolean;

const isPrimitive = (value: unknown): value is Primitive =>
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean';

const isPrimitiveList = (value: unknown): value is Primitive[] =>
    Array.isArray(value) && value.every(isPrimitive);

const isEmpty = (value: unknown): boolean =>
    value === null ||
    value === undefined ||
    (typeof value === 'string' && !value.trim()) ||
    (Array.isArray(value) && value.length === 0);

const asText = (value: Primitive): string => String(value).trim();

/** Равенство с поправкой на формат: «100.00» и «100» — одно и то же. */
const sameValue = (a: Primitive, b: Primitive): boolean => {
    const left = asText(a);
    const right = asText(b);
    if (left === right) return true;
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    return (
        left !== '' &&
        right !== '' &&
        Number.isFinite(leftNumber) &&
        Number.isFinite(rightNumber) &&
        leftNumber === rightNumber
    );
};

const sameList = (a: Primitive[], b: Primitive[]): boolean =>
    a.length === b.length && a.every((item, i) => sameValue(item, b[i]));

const unionList = (lists: Primitive[][]): Primitive[] => {
    const seen = new Set<string>();
    const result: Primitive[] = [];
    for (const list of lists) {
        for (const item of list) {
            const key = asText(item);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            result.push(item);
        }
    }
    return result;
};

type FieldValue = Primitive | Primitive[];

/**
 * Итоговое значение поля главной карточки; undefined — поле не трогаем
 * (пустое везде, файл или множественное поле с объектами — телефоны, почты:
 * их Битрикс объединяет сам).
 */
const finalValueOf = (
    field: string,
    values: unknown[],
): FieldValue | undefined => {
    const filled = values.filter(value => !isEmpty(value));
    if (!filled.length) return undefined;
    if (
        filled.some(
            value => typeof value === 'object' && !isPrimitiveList(value),
        )
    ) {
        return undefined;
    }
    if (filled.some(isPrimitiveList)) {
        // Пустое множественное поле Битрикс отдаёт и как false — в объединение
        // идут только сами списки.
        return unionList(filled.filter(isPrimitiveList));
    }
    const primitives = filled.filter(isPrimitive);
    if (field !== CONCATENATED_FIELD) return primitives[0];
    const parts: string[] = [];
    for (const value of primitives) {
        const text = asText(value);
        if (!parts.some(part => part.includes(text))) parts.push(text);
    }
    return parts.join('\n\n');
};

const differs = (value: unknown, final: FieldValue): boolean => {
    if (Array.isArray(final)) {
        return !isPrimitiveList(value) || !sameList(value, final);
    }
    return !isPrimitive(value) || isEmpty(value) || !sameValue(value, final);
};

/**
 * Что поменять перед повторным объединением. Главная карточка — первое
 * слово: её непустые значения сохраняются, дубли подстраиваются под неё.
 */
export const harmonizeForMerge = (
    survivor: MergeRow,
    victims: readonly MergeVictimRow[],
): MergeHarmonization => {
    const survivorPatch: MergeRow = {};
    const victimPatches = new Map<number, MergeRow>();
    const notes: MergeConflictNote[] = [];

    const fields = new Set<string>(Object.keys(survivor));
    for (const victim of victims) {
        for (const field of Object.keys(victim.row)) fields.add(field);
    }

    for (const field of fields) {
        if (isSkipped(field)) continue;
        const final = finalValueOf(field, [
            survivor[field],
            ...victims.map(victim => victim.row[field]),
        ]);
        if (final === undefined) continue;

        if (differs(survivor[field], final)) survivorPatch[field] = final;

        for (const victim of victims) {
            const value = victim.row[field];
            if (isEmpty(value) || !differs(value, final)) continue;
            // Пустое множественное поле (false) расхождением не считается.
            if (Array.isArray(final) && !isPrimitiveList(value)) continue;
            const patch = victimPatches.get(victim.id) ?? {};
            patch[field] = final;
            victimPatches.set(victim.id, patch);
            // Списки объединены, комментарии склеены — терять нечего.
            if (Array.isArray(final) || field === CONCATENATED_FIELD) continue;
            notes.push({
                victimId: victim.id,
                field,
                victimValue: asText(value as Primitive),
                keptValue: asText(final),
            });
        }
    }

    return { survivorPatch, victimPatches, notes };
};

/** Есть ли что менять — иначе повторять объединение бессмысленно. */
export const hasHarmonizationChanges = (
    harmonization: MergeHarmonization,
): boolean =>
    Object.keys(harmonization.survivorPatch).length > 0 ||
    harmonization.victimPatches.size > 0;
