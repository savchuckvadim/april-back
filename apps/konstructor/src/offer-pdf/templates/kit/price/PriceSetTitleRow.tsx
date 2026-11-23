import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { priceStyles } from './price.styles';
import { PriceCell } from './PriceCell';

export interface PriceSetTitleRowProps {
    /** «Набор N» */
    title: string;
    theme: OfferPdfTheme;
}

/**
 * Заголовок набора для сравнения: строка во всю ширину таблицы цен перед
 * первой строкой набора. Цвета и кегль — как у шапки таблицы, из темы стиля.
 */
export const PriceSetTitleRow: FC<PriceSetTitleRowProps> = ({
    title,
    theme,
}) => {
    const styles = priceStyles(theme);
    return (
        <View style={[styles.row, styles.rowSetTitle]}>
            <PriceCell width="100%" theme={theme} last>
                <Text style={styles.cellSetTitle}>{title}</Text>
            </PriceCell>
        </View>
    );
};
