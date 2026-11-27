import { IProductRenderItemData } from '@app/konstructor/offer-word/services/render-data-services/offer-render-price.service';
import type { OfferPdfSettings } from '../../../model/offer-pdf-settings';
import { parseAmount } from '../lib/text.util';

export interface PriceColumn {
    title: string;
    width: string;
}

/** Колонка «Наименование» — вторая: в ней название и поставка строкой ниже */
export const NAME_COLUMN_INDEX = 1;

/** В строках есть скидка — нужна колонка «Скидка» */
export const hasDiscount = (rows: IProductRenderItemData[]): boolean =>
    rows.some(row => parseAmount(row.ProductDiscountPercent) > 0);

/**
 * Скидка видна в таблице цен КП: она есть в строках и менеджер её не скрыл
 * (`settings.showDiscount`). Скрытая скидка: колонки «Скидка» нет, в «Цене»
 * цена со скидкой, как у КП без скидок.
 */
export const showsDiscount = (
    rows: IProductRenderItemData[],
    settings: Pick<OfferPdfSettings, 'showDiscount'>,
): boolean => settings.showDiscount && hasDiscount(rows);

export const priceColumns = (withDiscount: boolean): PriceColumn[] => [
    { title: '№', width: '6%' },
    { title: 'Наименование', width: withDiscount ? '40%' : '49%' },
    { title: 'Кол-во', width: '10%' },
    { title: 'Ед.', width: '9%' },
    { title: 'Цена', width: '13%' },
    ...(withDiscount ? [{ title: 'Скидка', width: '9%' }] : []),
    { title: 'Сумма', width: '13%' },
];

/** Значения ячеек строки по колонкам; у «Наименования» — null, его рисует строка */
export const priceRowValues = (
    row: IProductRenderItemData,
    index: number,
    withDiscount: boolean,
): Array<string | null> => [
    row.ProductNumber || String(index + 1),
    null,
    row.ProductQuantity,
    row.ProductMeasure,
    withDiscount
        ? row.ProductPriceDefault || row.ProductPrice
        : row.ProductPrice,
    ...(withDiscount
        ? [
              parseAmount(row.ProductDiscountPercent) > 0
                  ? `${row.ProductDiscountPercent} %`
                  : '—',
          ]
        : []),
    row.ProductSum,
];
