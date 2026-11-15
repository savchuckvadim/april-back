import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { OfferPdfTheme } from '../../kit/theme/offer-pdf-theme';
import { modernCoverStyles } from './modern-cover.styles';

export interface ModernContactProps {
    value: string;
    theme: OfferPdfTheme;
}

/** Контакт с акцентной точкой: телефон, почта */
export const ModernContact: FC<ModernContactProps> = ({ value, theme }) => {
    const styles = modernCoverStyles(theme);
    return (
        <View style={styles.contactRow}>
            <View style={styles.dot} />
            <Text style={styles.contact}>{value}</Text>
        </View>
    );
};
