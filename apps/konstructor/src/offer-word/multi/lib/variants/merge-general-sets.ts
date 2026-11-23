import { ProductRowDto } from '@app/konstructor/document-generate/dto/product-row/product-row.dto';
import {
    ProductRowSetDto,
    ProductRowSetItemDto,
} from '@app/konstructor/document-generate/dto/product-row-set/product-row-set.dto';
import { ProductTypeEnum } from '@app/konstructor/document-generate/dto/product/product.dto';
import { mergeTotals } from './merge-document-variants';

export interface MergedGeneralSet {
    /** Единый набор; `null`, когда наборов нет. */
    set: ProductRowSetDto | null;
    /** Что не сошлось при сложении итогов наборов (срок). */
    warnings: string[];
}

/**
 * Типы продукта в порядке печати: Гарант, LT, прочие LT, консалтинг, СТАР,
 * Академия — так строки идут в наборе, который собрал конструктор.
 */
const PRODUCT_TYPES: readonly ProductTypeEnum[] =
    Object.values(ProductTypeEnum);

/** Строки по типам продукта: наборы подряд, пустой тип в результат не попадает. */
const mergeSetRows = (
    sets: readonly ProductRowSetDto[],
): ProductRowSetItemDto => {
    const rows: ProductRowSetItemDto = {};
    for (const type of PRODUCT_TYPES) {
        const merged = sets.flatMap(set => set.rows?.[type] ?? []);
        if (merged.length) {
            rows[type] = merged;
        }
    }
    return rows;
};

/**
 * Итоговая строка набора. Первая строка `total` и есть итог набора: так её
 * читает сборка счёта. Набор без итога в сумму не входит.
 */
const collectSetTotals = (
    sets: readonly ProductRowSetDto[],
): ProductRowDto[] => {
    const totals: ProductRowDto[] = [];
    for (const set of sets) {
        const total = set.total?.[0];
        if (total) {
            totals.push(total);
        }
    }
    return totals;
};

/**
 * Наборы `sets.general` → один набор. Сборка счёта делает по файлу на каждый
 * набор, поэтому один счёт на договор получается из одного набора.
 *
 * Строки по типам продукта идут подряд в порядке наборов, итог собирает
 * `mergeTotals` (суммы складываются, скидка пересчитывается от сумм, срок
 * берётся первый). Сведённый набор — `id` 0, `show` false. Один набор
 * возвращается как есть, пустой список даёт `set: null`.
 */
export const mergeGeneralSets = (
    sets: readonly ProductRowSetDto[],
): MergedGeneralSet => {
    const [first] = sets;
    if (!first) {
        return { set: null, warnings: [] };
    }
    if (sets.length === 1) {
        return { set: first, warnings: [] };
    }

    const totals = collectSetTotals(sets);
    const merged = totals.length
        ? mergeTotals(totals)
        : { total: null, warnings: [] };

    return {
        set: {
            id: 0,
            show: false,
            rows: mergeSetRows(sets),
            total: merged.total ? [merged.total] : [],
        },
        warnings: merged.warnings,
    };
};
