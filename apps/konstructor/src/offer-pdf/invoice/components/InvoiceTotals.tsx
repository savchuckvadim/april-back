import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { OfferPdfTheme } from '../../templates/kit/theme/offer-pdf-theme';
import { invoiceTotalLines } from '../lib/invoice-pdf-lines.util';
import type { InvoicePdfModel } from '../model/invoice-pdf.model';
import { invoiceStyles } from './invoice-pdf.styles';

export interface InvoiceTotalsProps {
    model: InvoicePdfModel;
    theme: OfferPdfTheme;
}

/**
 * Итоги под таблицей: сумма, налог, число наименований и сумма прописью.
 * Скидка здесь не печатается: она видна в таблице, а итог идёт готовой суммой.
 */
export const InvoiceTotals: FC<InvoiceTotalsProps> = ({ model, theme }) => {
    const { data } = model;
    const lines = invoiceTotalLines(
        data.TotalRow?.[0],
        data.ProductRows?.length ?? 0,
    );
    if (!lines) return null;
    const styles = invoiceStyles(theme);

    return (
        <View style={styles.totals} wrap={false}>
            <Text style={styles.totalLine}>{lines.total}</Text>
            {lines.tax ? (
                <Text style={styles.totalSub}>{lines.tax}</Text>
            ) : null}
            <Text style={styles.totalSub}>{lines.count}</Text>
            {lines.words ? (
                <Text style={styles.totalWords}>{lines.words}</Text>
            ) : null}
        </View>
    );
};
