import {
    METHODOLOGY_CONDITION_OPS,
    METHODOLOGY_FACT_FIELDS,
    type CheckpointStatus,
    type MethodologyCondition,
    type MethodologyFactField,
    type MethodologyFactValue,
} from './methodology.types';

/**
 * Условия методики: проверка формы (валидатор конфига) и вычисление по
 * фактам разбора (ограничители и пункты с правилом). Чистые функции.
 */

/** Факты разбора для условий; отсутствующее поле — «неизвестно». */
export type MethodologyFacts = Partial<
    Record<MethodologyFactField, MethodologyFactValue>
>;

/** Нормы типа звонка для above_norm / within_norm (верхняя граница). */
export type MethodologyNorms = Partial<
    Record<MethodologyFactField, number | null>
>;

export interface MethodologyConditionContext {
    facts: MethodologyFacts;
    norms?: MethodologyNorms;
    /** Статусы уже посчитанных пунктов по коду. */
    checkpoints?: Readonly<Record<string, CheckpointStatus>>;
}

const FIELD_OPS: ReadonlySet<string> = new Set([
    'is',
    'not',
    'empty',
    'not_empty',
    'lt',
    'lte',
    'gt',
    'gte',
    'above_norm',
    'within_norm',
]);
const VALUE_OPS: ReadonlySet<string> = new Set(['is', 'not']);
const NUMERIC_OPS: ReadonlySet<string> = new Set(['lt', 'lte', 'gt', 'gte']);
const CHECKPOINT_OPS: ReadonlySet<string> = new Set([
    'checkpoint_missed',
    'checkpoint_done',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const isFactValue = (value: unknown): value is MethodologyFactValue =>
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string';

/**
 * Проверка условия из JSON: возвращает ошибки на русском с путём
 * (`caps[2].when[0]`). `checkpointCodes` — коды пунктов методики для
 * операций checkpoint_*.
 */
export function validateCondition(
    input: unknown,
    path: string,
    checkpointCodes: ReadonlySet<string>,
): string[] {
    if (!isRecord(input)) return [`${path}: условие должно быть объектом`];
    const errors: string[] = [];
    const op = typeof input.op === 'string' ? input.op : '';
    if (!(METHODOLOGY_CONDITION_OPS as readonly string[]).includes(op)) {
        return [`${path}.op: неизвестная операция «${String(input.op)}»`];
    }
    if (FIELD_OPS.has(op)) {
        const field = typeof input.field === 'string' ? input.field : '';
        if (!(METHODOLOGY_FACT_FIELDS as readonly string[]).includes(field)) {
            errors.push(
                `${path}.field: неизвестный факт «${String(input.field)}»`,
            );
        }
    }
    if (VALUE_OPS.has(op) && !isFactValue(input.value)) {
        errors.push(
            `${path}.value: для ${op} нужно значение (true/false, число, строка или null)`,
        );
    }
    if (NUMERIC_OPS.has(op) && typeof input.value !== 'number') {
        errors.push(`${path}.value: для ${op} нужно число`);
    }
    if (CHECKPOINT_OPS.has(op)) {
        const code =
            typeof input.checkpoint === 'string' ? input.checkpoint : '';
        if (!checkpointCodes.has(code)) {
            errors.push(
                `${path}.checkpoint: пункт «${String(input.checkpoint)}» в методике не описан`,
            );
        }
    }
    return errors;
}

/** Нормализованное условие из проверенного JSON (лишние поля отбрасываются). */
export function toCondition(
    input: Record<string, unknown>,
): MethodologyCondition {
    const op = input.op as MethodologyCondition['op'];
    const condition: MethodologyCondition = { op };
    if (FIELD_OPS.has(op)) {
        condition.field = input.field as MethodologyFactField;
    }
    if (
        (VALUE_OPS.has(op) || NUMERIC_OPS.has(op)) &&
        isFactValue(input.value)
    ) {
        condition.value = input.value;
    }
    if (CHECKPOINT_OPS.has(op) && typeof input.checkpoint === 'string') {
        condition.checkpoint = input.checkpoint;
    }
    return condition;
}

/** Пусто: неизвестно, null, пустая строка или ноль. */
const isEmpty = (value: MethodologyFactValue | undefined): boolean =>
    value === undefined || value === null || value === '' || value === 0;

/**
 * Одно условие по фактам. Неизвестный факт (поля нет) — сравнения и
 * нормы не срабатывают, `empty` — срабатывает. Нормы нет — above_norm и
 * within_norm не срабатывают.
 */
export function evaluateCondition(
    condition: MethodologyCondition,
    context: MethodologyConditionContext,
): boolean {
    const { op } = condition;
    if (op === 'checkpoint_missed' || op === 'checkpoint_done') {
        const status = condition.checkpoint
            ? context.checkpoints?.[condition.checkpoint]
            : undefined;
        return op === 'checkpoint_missed'
            ? status === 'missed'
            : status === 'done';
    }
    const field = condition.field;
    const fact = field === undefined ? undefined : context.facts[field];
    switch (op) {
        case 'is':
            return fact !== undefined && fact === condition.value;
        case 'not':
            return fact !== undefined && fact !== condition.value;
        case 'empty':
            return isEmpty(fact);
        case 'not_empty':
            return !isEmpty(fact);
        case 'lt':
        case 'lte':
        case 'gt':
        case 'gte':
            return compareNumbers(op, fact, condition.value);
        case 'above_norm':
        case 'within_norm': {
            const norm =
                field === undefined ? undefined : context.norms?.[field];
            if (typeof fact !== 'number' || typeof norm !== 'number')
                return false;
            return op === 'above_norm' ? fact > norm : fact <= norm;
        }
        default:
            return false;
    }
}

function compareNumbers(
    op: 'lt' | 'lte' | 'gt' | 'gte',
    fact: MethodologyFactValue | undefined,
    value: MethodologyFactValue | undefined,
): boolean {
    if (typeof fact !== 'number' || typeof value !== 'number') return false;
    switch (op) {
        case 'lt':
            return fact < value;
        case 'lte':
            return fact <= value;
        case 'gt':
            return fact > value;
        case 'gte':
            return fact >= value;
    }
}

/** Все условия выполнены (И); пустой список — ложь, чтобы ограничитель без условий не срабатывал. */
export const evaluateAll = (
    conditions: readonly MethodologyCondition[],
    context: MethodologyConditionContext,
): boolean =>
    conditions.length > 0 &&
    conditions.every(condition => evaluateCondition(condition, context));
