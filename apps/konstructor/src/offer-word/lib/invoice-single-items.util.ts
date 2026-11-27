import type {
    IInvoiceRenderData,
    IInvoiceSingleItemRenderData,
} from '../services/render-data-services/invoice-render-data.service';
import { InvoiceSetKind } from '../types/invoice-set.types';
import { formatInvoiceNumber } from './invoice-number.util';

/** Данные одного счёта для рендера и набор, из которого он собран. */
export interface InvoiceSingleRenderItem {
    data: IInvoiceSingleItemRenderData;
    setKind: InvoiceSetKind;
    setIndex: number;
}

/**
 * Общие данные счёта разложены на счета по наборам: один набор, один счёт.
 * Номер счёта идёт по порядку выпуска в генерации: первый N, следующие N-1,
 * N-2… (`numberOffset` — сколько счетов уже выпущено прежними вызовами).
 *
 * Общий шаг Word-счёта и PDF-счёта: суммы, строки и номера у обоих форматов
 * считаются в одном месте.
 */
export const splitInvoiceRenderData = (
    renderData: IInvoiceRenderData,
    numberOffset = 0,
): InvoiceSingleRenderItem[] =>
    renderData.prices.map((price, index) => ({
        data: {
            ...renderData,
            ...price.rows,
            ...price.total,
            InvoiceNumber: formatInvoiceNumber(
                renderData.InvoiceNumber,
                numberOffset + index,
            ),
        },
        setKind: price.setKind,
        setIndex: price.setIndex,
    }));
