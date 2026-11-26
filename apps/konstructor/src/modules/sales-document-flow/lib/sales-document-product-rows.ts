import type { SalesDocumentProductRow } from '@lib/queue/constants/sales-document-event-job';
import { ProductRowDto } from '@app/konstructor/document-generate/dto/product-row/product-row.dto';
import {
    generalRowsOf,
    roundMoney,
    SalesDocumentSource,
    toPositiveInt,
} from './sales-document-source';

/**
 * Скидка в `crm.item.productrow.set`: тип 1 — сумма в рублях (так же пишет
 * отправка сделки из конструктора).
 */
const DISCOUNT_TYPE_SUM = 1;

/** Код единицы измерения Bitrix: `price.measure.code`, а без него `id`. */
const measureOf = (row: ProductRowDto): number | null =>
    toPositiveInt(row.price?.measure?.code) ??
    toPositiveInt(row.price?.measure?.id);

/**
 * Строка таблицы цен конструктора → товарная строка Bitrix.
 *
 * `price` — цена единицы со скидкой, `priceNetto` — цена по прайсу, скидка
 * в рублях считается как разница. Строка без названия, без цены или с
 * нулевым количеством пропускается: Bitrix отклонил бы такую строку вместе
 * со всем набором, и событие осталось бы без товарных строк.
 */
export const toSalesDocumentProductRow = (
    row: ProductRowDto,
    sort: number,
): SalesDocumentProductRow | null => {
    const productName = (row?.name || row?.shortName || '').trim();
    const unit = Number(row?.price?.current);
    const quantity = Number(row?.price?.quantity);
    if (
        !productName ||
        !Number.isFinite(unit) ||
        unit < 0 ||
        !Number.isFinite(quantity) ||
        quantity <= 0
    ) {
        return null;
    }

    const price = roundMoney(unit);
    const list = Number(row.price.default);
    const priceNetto =
        Number.isFinite(list) && list > price ? roundMoney(list) : price;
    const measure = measureOf(row);

    return {
        productName,
        price,
        quantity,
        priceNetto,
        discountSum: roundMoney(priceNetto - price),
        discountTypeId: DISCOUNT_TYPE_SUM,
        ...(measure ? { measureCode: String(measure), measureId: measure } : {}),
        sort,
    };
};

/**
 * Товарные строки событий: общие наборы всех документов подряд, порядок
 * `sort` сквозной.
 */
export const salesDocumentProductRows = (
    sources: readonly SalesDocumentSource[],
): SalesDocumentProductRow[] => {
    const rows: SalesDocumentProductRow[] = [];
    for (const row of sources.flatMap(generalRowsOf)) {
        const mapped = toSalesDocumentProductRow(row, rows.length);
        if (mapped) {
            rows.push(mapped);
        }
    }
    return rows;
};
