import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { OfferPdfTheme } from '../../kit/theme/offer-pdf-theme';
import { monoStyles } from './mono.styles';

export interface MonoPillProps {
    label: string;
    theme: OfferPdfTheme;
}

/** Контурная «таблетка» с подписью капсом: дата, компания */
export const MonoPill: FC<MonoPillProps> = ({ label, theme }) => {
    const styles = monoStyles(theme);
    return (
        <View style={styles.pill}>
            <Text style={styles.pillText}>{label}</Text>
        </View>
    );
};
