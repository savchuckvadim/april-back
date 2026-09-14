/**
 * Проверка значения по дескриптору реестра — единственный источник правил
 * «подходит ли значение коду»: её зовут `resolveParam` (слои настроек),
 * модель (`lag-cdf.ts` — диапазон F(d) и CIF) и сохранение настроек.
 *
 * Чистые функции: без DI, Bitrix и Prisma, исключений не бросают.
 */
import type {
    ParamDescriptor,
    ParamPrimitive,
    ParamRange,
    ParamResolveReason,
    ParamValueKind,
} from './registry.types';

/** Значение — примитив реестра (число, строка или флаг). */
export const isParamPrimitive = (value: unknown): value is ParamPrimitive =>
    typeof value === 'number' ||
    typeof value === 'string' ||
    typeof value === 'boolean';

/** Число в границах [min; max]; без границ — любое. */
export const inParamRange = (value: number, range?: ParamRange): boolean =>
    range === undefined || (value >= range[0] && value <= range[1]);

/** Вид значения дескриптора: явный `kind` или тип дефолта. */
export function paramValueKind(descriptor: ParamDescriptor): ParamValueKind {
    if (descriptor.kind !== undefined) {
        return descriptor.kind;
    }
    switch (typeof descriptor.defaultValue) {
        case 'number':
            return 'number';
        case 'boolean':
            return 'boolean';
        default:
            return 'string';
    }
}

/** Элементы CSV-значения: без пробелов по краям и без пустых. */
export function csvItems(value: string): string[] {
    return value
        .split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0);
}

/** Строка — JSON-объект или массив (составное значение по правилу §2.1). */
function isJsonComposite(value: string): boolean {
    try {
        const parsed: unknown = JSON.parse(value);

        return typeof parsed === 'object' && parsed !== null;
    } catch {
        return false;
    }
}

/**
 * CSV допустим: пустая строка — «ничего не выбрано» (семантические минимумы
 * проверяет sanity настроек), иначе непустые уникальные элементы, каждый —
 * из словаря, если словарь задан.
 */
function isValidCsv(value: string, allowed?: readonly string[]): boolean {
    if (value.trim() === '') {
        return true;
    }
    const items = csvItems(value);
    if (items.length === 0 || new Set(items).size !== items.length) {
        return false;
    }

    return allowed === undefined || items.every(item => allowed.includes(item));
}

/**
 * Причина, по которой значение не подходит дескриптору; `undefined` —
 * подходит. Порядок проверок: тип → диапазон числа → словарь строки.
 */
export function validateParamValue(
    descriptor: ParamDescriptor,
    value: unknown,
): ParamResolveReason | undefined {
    if (
        !isParamPrimitive(value) ||
        typeof value !== typeof descriptor.defaultValue
    ) {
        return 'type-mismatch';
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) && inParamRange(value, descriptor.range)
            ? undefined
            : 'out-of-range';
    }
    if (typeof value !== 'string') {
        return undefined;
    }
    switch (paramValueKind(descriptor)) {
        case 'enum':
            return descriptor.enumValues?.includes(value) === true
                ? undefined
                : 'invalid-value';
        case 'csv':
            return isValidCsv(value, descriptor.enumValues)
                ? undefined
                : 'invalid-value';
        case 'json':
            return isJsonComposite(value) ? undefined : 'invalid-value';
        default:
            return undefined;
    }
}
