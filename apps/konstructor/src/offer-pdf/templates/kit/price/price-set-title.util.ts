/** Часть строки цен, по которой решается, печатать ли перед ней заголовок набора */
export interface PriceSetTitleSource {
    ProductSetTitle?: string;
    IsSetFirstRow?: boolean;
}

/**
 * Перед строкой печатается заголовок набора для сравнения: она первая в
 * наборе и заголовок не пуст. Строки без признаков набора (общий набор,
 * старые данные) заголовка не имеют.
 */
export const hasSetTitle = (row: PriceSetTitleSource): boolean =>
    Boolean(row.IsSetFirstRow) && Boolean(row.ProductSetTitle);
