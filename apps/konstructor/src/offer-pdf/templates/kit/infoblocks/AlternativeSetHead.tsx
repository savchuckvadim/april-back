import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { infoblocksStyles } from './infoblocks.styles';

export interface AlternativeSetHeadProps {
    /** Заголовок набора: «Набор N» */
    title: string;
    theme: OfferPdfTheme;
}

/**
 * Плашка набора для сравнения: заливка шапки таблицы цен и заголовок набора
 * токенами темы, новых нет. Держится вместе с заголовком первого комплекта и
 * первой группой — связку собирает HeadWithFirst.
 */
export const AlternativeSetHead: FC<AlternativeSetHeadProps> = ({
    title,
    theme,
}) => {
    const styles = infoblocksStyles(theme);
    return (
        <View style={styles.alternativeSetHead}>
            <Text style={styles.alternativeSetTitle}>{title}</Text>
        </View>
    );
};
