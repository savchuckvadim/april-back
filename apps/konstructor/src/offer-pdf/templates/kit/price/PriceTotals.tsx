import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { ITotalRowItemRenderData } from '@app/konstructor/offer-word/services/render-data-services/offer-render-price.service';
import { baseStyles } from '../base.styles';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { priceStyles } from './price.styles';

export interface PriceTotalsProps {
    total: ITotalRowItemRenderData;
    theme: OfferPdfTheme;
}

/** Итог под таблицей: сумма, в месяц, налог, прописью */
export const PriceTotals: FC<PriceTotalsProps> = ({ total, theme }) => {
    const styles = priceStyles(theme);
    return (
        <View style={styles.totals} wrap={false}>
            <Text style={styles.totalLine}>
                <Text style={baseStyles(theme).bold}>Итого: </Text>
                {total.TotalSum}
            </Text>
            {total.TotalMonthSum ? (
                <Text style={styles.totalSub}>
                    В месяц: {total.TotalMonthSum}
                </Text>
            ) : null}
            {total.TotalTaxInvoiceInfo ? (
                <Text style={styles.totalSub}>{total.TotalTaxInvoiceInfo}</Text>
            ) : null}
            {total.TotalSumString ? (
                <Text style={styles.totalSub}>
                    Сумма прописью: {total.TotalSumString}
                </Text>
            ) : null}
        </View>
    );
};
