import { ProductRowDto } from '@app/konstructor/document-generate/dto/product-row/product-row.dto';
import { ProductRowSetDto } from '@app/konstructor/document-generate/dto/product-row-set/product-row-set.dto';
import { ALTERNATIVE_ROW_TYPE } from '@app/konstructor/document-generate/product-rows/product-set-marks.util';
import { collectSetRows } from '@app/konstructor/offer-word/lib/collect-set-rows.util';

/**
 * Один печатаемый документ глазами потока продаж: итог общего набора и его
 * строки. Под форму подходят запрос одиночного КП (Word и PDF), участник
 * комплекта и запрос договора, поэтому все поля необязательны: старые слепки
 * фронта присылают то, что есть.
 */
export interface SalesDocumentSource {
    /** Название участника: запасной вариант, если у строк нет названия. */
    readonly title?: string | null;
    /** Поставка документа: подпись для текста события. */
    readonly supply?: { readonly name?: string | null } | null;
    /** Итоговая строка общего набора. */
    readonly total?: ProductRowDto | null;
    /** Все строки документа: общий набор, затем наборы для сравнения. */
    readonly rows?: readonly ProductRowDto[] | null;
    /** Наборы строк: запасной источник общего набора. */
    readonly sets?: {
        readonly general?: readonly ProductRowSetDto[] | null;
    } | null;
}

/** Деньги до копеек: убирает хвосты плавающей точки. */
export const roundMoney = (value: number): number =>
    Math.round(value * 100) / 100;

/** Целое больше нуля или null: id из запроса приходит и числом, и строкой. */
export const toPositiveInt = (value: unknown): number | null => {
    const parsed =
        typeof value === 'string' && value.trim() !== ''
            ? Number(value)
            : value;
    return typeof parsed === 'number' &&
        Number.isInteger(parsed) &&
        parsed > 0
        ? parsed
        : null;
};

/**
 * Строки общего набора: то, что предлагают купить. Строки наборов «для
 * сравнения» (`type: alternative`) в документ потока продаж не входят.
 */
export const generalRowsOf = (source: SalesDocumentSource): ProductRowDto[] => {
    const fromRows = (source.rows ?? []).filter(
        row => row?.type !== ALTERNATIVE_ROW_TYPE,
    );
    if (fromRows.length) {
        return fromRows;
    }
    return (source.sets?.general ?? []).flatMap(set =>
        collectSetRows(set?.rows),
    );
};

/** Сумма итоговой строки: `price.sum`, а без неё цена × количество. */
const totalSumOf = (total: ProductRowDto | null | undefined): number | null => {
    const price = total?.price;
    if (!price) {
        return null;
    }
    const sum = Number(price.sum);
    if (Number.isFinite(sum) && sum >= 0) {
        return sum;
    }
    const computed = Number(price.current) * Number(price.quantity);
    return Number.isFinite(computed) && computed >= 0 ? computed : null;
};

/**
 * Сумма события: итоги общих наборов всех документов, в рублях. Документ без
 * итога в сумму не входит; сумма не набралась или равна нулю: `undefined`,
 * иначе пустая сумма затёрла бы в сделке настоящую.
 */
export const salesDocumentSum = (
    sources: readonly SalesDocumentSource[],
): number | undefined => {
    const sums = sources
        .map(source => totalSumOf(source.total))
        .filter((sum): sum is number => sum !== null);
    const total = roundMoney(sums.reduce((acc, sum) => acc + sum, 0));
    return total > 0 ? total : undefined;
};
