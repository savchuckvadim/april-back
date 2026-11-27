import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { OfferPdfTheme } from '../../templates/kit/theme/offer-pdf-theme';
import {
    buyerLine,
    paymentDueLine,
    supplierLine,
} from '../lib/invoice-pdf-lines.util';
import type { InvoicePdfModel } from '../model/invoice-pdf.model';
import { invoiceStyles } from './invoice-pdf.styles';

export interface InvoicePartiesProps {
    model: InvoicePdfModel;
    theme: OfferPdfTheme;
}

/** Срок оплаты, поставщик и покупатель строками под заголовком счёта. */
export const InvoiceParties: FC<InvoicePartiesProps> = ({ model, theme }) => {
    const { data } = model;
    const styles = invoiceStyles(theme);
    const due = paymentDueLine(data);
    const buyer = buyerLine(data);

    return (
        <View style={styles.parties}>
            {due ? (
                <Text style={styles.party}>
                    <Text style={styles.bold}>Срок оплаты: </Text>
                    {due}
                </Text>
            ) : null}
            <Text style={styles.party}>
                <Text style={styles.bold}>Поставщик: </Text>
                {supplierLine(data)}
            </Text>
            {buyer ? (
                <Text style={styles.party}>
                    <Text style={styles.bold}>Покупатель: </Text>
                    {buyer}
                </Text>
            ) : null}
        </View>
    );
};
