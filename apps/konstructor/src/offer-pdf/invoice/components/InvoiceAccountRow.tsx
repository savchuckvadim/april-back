import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { OfferPdfTheme } from '../../templates/kit/theme/offer-pdf-theme';
import { invoiceStyles } from './invoice-pdf.styles';

export interface InvoiceAccountRowProps {
    /** «БИК», «Сч. №» */
    label: string;
    value: string;
    theme: OfferPdfTheme;
}

/** Строка банковских реквизитов: подпись слева, значение справа. */
export const InvoiceAccountRow: FC<InvoiceAccountRowProps> = ({
    label,
    value,
    theme,
}) => {
    const styles = invoiceStyles(theme);
    return (
        <View style={styles.accountRow}>
            <View style={[styles.cell, styles.accountLabel]}>
                <Text style={styles.text}>{label}</Text>
            </View>
            <View style={[styles.cell, styles.accountValue]}>
                <Text style={styles.text}>{value}</Text>
            </View>
        </View>
    );
};
