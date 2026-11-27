import type { FC } from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { OfferPdfTheme } from '../../templates/kit/theme/offer-pdf-theme';
import { invoiceTitle } from '../lib/invoice-pdf-lines.util';
import type { InvoicePdfModel } from '../model/invoice-pdf.model';
import { InvoiceBankBlock } from './InvoiceBankBlock';
import { InvoiceParties } from './InvoiceParties';
import { InvoiceSignatures } from './InvoiceSignatures';
import { InvoiceTable } from './InvoiceTable';
import { InvoiceTotals } from './InvoiceTotals';
import { invoiceStyles } from './invoice-pdf.styles';

export interface InvoicePdfDocumentProps {
    model: InvoicePdfModel;
    theme: OfferPdfTheme;
}

/**
 * Счёт на оплату одним документом: банковская шапка (с QR), заголовок,
 * срок, поставщик и покупатель, таблица позиций, итоги, подписи и печать.
 * Порядок и состав блоков, как у легаси. Тема даёт цвета, кегли и шрифты.
 */
export const InvoicePdfDocument: FC<InvoicePdfDocumentProps> = ({
    model,
    theme,
}) => {
    const styles = invoiceStyles(theme);
    const { data } = model;
    const number = data.InvoiceNumber?.trim();

    return (
        <Document
            title={number ? `Счёт № ${number}` : 'Счёт на оплату'}
            author={data.MyCompanyName || undefined}
            creator="April Konstructor"
            producer="April Konstructor"
            language="ru"
        >
            <Page size="A4" style={styles.page}>
                <View style={styles.content}>
                    <InvoiceBankBlock model={model} theme={theme} />
                    <Text style={styles.title}>{invoiceTitle(data)}</Text>
                    <InvoiceParties model={model} theme={theme} />
                    <InvoiceTable model={model} theme={theme} />
                    <InvoiceTotals model={model} theme={theme} />
                    <InvoiceSignatures model={model} theme={theme} />
                </View>
            </Page>
        </Document>
    );
};
