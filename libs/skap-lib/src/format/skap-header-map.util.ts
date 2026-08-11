import {
    SkapFileKind,
    SkapFormatError,
    SkapFormatWarning,
} from './skap-format.types';

/** Нормализация имени колонки для сравнения: trim + lowercase + один пробел. */
export function normalizeSkapHeader(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface SkapHeaderMap<TKey extends string> {
    /** Ключ формата → индекс колонки в строке (-1 — колонки нет). */
    indexByKey: Record<TKey, number>;
    /** Первая строка — заголовок (данные начинаются со второй). */
    hasHeader: boolean;
    warnings: SkapFormatWarning[];
}

/**
 * Header-map: строит карту «ключ → индекс» по именам колонок заголовка.
 *
 * Матрица исходов защиты от смены формата:
 * - порядок изменился / добавились новые колонки → работаем + ворнинг;
 * - обязательная колонка пропала/переименована → SkapFormatError
 *   (файл error_format, немедленный алерт);
 * - заголовка нет (легаси-файл) → позиционный fallback по порядку ключей
 *   эталона + ворнинг format_no_header.
 */
export function buildSkapHeaderMap<TKey extends string>(
    kind: SkapFileKind,
    headerCells: string[],
    columns: Record<TKey, string>,
    required: readonly TKey[],
): SkapHeaderMap<TKey> {
    const warnings: SkapFormatWarning[] = [];
    const keys = Object.keys(columns) as TKey[];
    const normalizedHeader = headerCells.map(normalizeSkapHeader);

    const expectedByNormalized = new Map<string, TKey>(
        keys.map(key => [normalizeSkapHeader(columns[key]), key]),
    );

    const matched = normalizedHeader.filter(cell =>
        expectedByNormalized.has(cell),
    ).length;

    // Заголовка нет вообще — позиционный fallback по порядку эталона.
    if (matched === 0) {
        const indexByKey = Object.fromEntries(
            keys.map((key, index) => [key, index]),
        ) as Record<TKey, number>;
        warnings.push({
            code: 'format_no_header',
            message:
                `Файл ${kind} без строки заголовка — колонки взяты ` +
                'позиционно по эталону V1 (легаси-формат).',
        });
        return { indexByKey, hasHeader: false, warnings };
    }

    const indexByKey = {} as Record<TKey, number>;
    for (const key of keys) {
        indexByKey[key] = normalizedHeader.indexOf(
            normalizeSkapHeader(columns[key]),
        );
    }

    const missingRequired = required.filter(key => indexByKey[key] === -1);
    if (missingRequired.length) {
        const names = missingRequired
            .map(key => `«${columns[key]}»`)
            .join(', ');
        throw new SkapFormatError(
            kind,
            `Формат ${kind} изменился: пропали обязательные колонки ${names}. ` +
                'Файл не обработан — обновите эталон формата (SKAP_FORMATS) ' +
                'или проверьте выгрузку.',
        );
    }

    const missingOptional = keys.filter(
        key => indexByKey[key] === -1 && !required.includes(key),
    );
    if (missingOptional.length) {
        warnings.push({
            code: 'format_extra_columns',
            message:
                `Формат ${kind}: нет необязательных колонок ` +
                missingOptional.map(key => `«${columns[key]}»`).join(', ') +
                ' — значения будут пустыми.',
        });
    }

    const extra = normalizedHeader.filter(
        cell => cell.length > 0 && !expectedByNormalized.has(cell),
    );
    if (extra.length) {
        warnings.push({
            code: 'format_extra_columns',
            message:
                `Формат ${kind}: неизвестные колонки (${extra.length} шт): ` +
                extra.slice(0, 5).join(', ') +
                ' — игнорируются, но эталон стоит обновить.',
        });
    }

    return { indexByKey, hasHeader: true, warnings };
}

/** Значение ячейки по ключу карты ('' — колонки нет / ячейка пустая). */
export function pickCell<TKey extends string>(
    row: string[],
    map: SkapHeaderMap<TKey>,
    key: TKey,
): string {
    const index = map.indexByKey[key];
    if (index < 0 || index >= row.length) return '';
    return row[index] ?? '';
}
