import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { OfferPdfTheme } from '../../kit/theme/offer-pdf-theme';
import { prismCoverStyles } from './prism-cover.styles';

export interface PrismContactProps {
    value: string;
    theme: OfferPdfTheme;
}

/** Контакт с акцентной точкой: телефон, почта */
export const PrismContact: FC<PrismContactProps> = ({ value, theme }) => {
    const styles = prismCoverStyles(theme);
    return (
        <View style={styles.contactRow}>
            <View style={styles.dot} />
            <Text style={styles.contact}>{value}</Text>
        </View>
    );
};
