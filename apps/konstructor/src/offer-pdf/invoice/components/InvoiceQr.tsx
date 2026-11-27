import type { FC } from 'react';
import { Image, Text, View } from '@react-pdf/renderer';
import type { OfferPdfImage } from '../../model/offer-pdf-document.model';
import type { OfferPdfTheme } from '../../templates/kit/theme/offer-pdf-theme';
import { QR_CAPTION } from '../lib/invoice-pdf-lines.util';
import { invoiceStyles } from './invoice-pdf.styles';

export interface InvoiceQrProps {
    image: OfferPdfImage;
    theme: OfferPdfTheme;
}

/** QR для оплаты справа от банковской шапки с подсказкой, как в легаси. */
export const InvoiceQr: FC<InvoiceQrProps> = ({ image, theme }) => {
    const styles = invoiceStyles(theme);
    return (
        <View style={styles.qrBox}>
            <Image style={styles.qr} src={image} />
            <Text style={styles.qrCaption}>{QR_CAPTION}</Text>
        </View>
    );
};
