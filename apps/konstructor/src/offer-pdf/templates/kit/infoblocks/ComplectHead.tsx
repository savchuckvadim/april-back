import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { infoblocksStyles } from './infoblocks.styles';

export interface ComplectHeadProps {
    /** Название комплекта */
    title: string;
    /** Подпись поставки; пусто — печатается одно название */
    supplyName: string;
    theme: OfferPdfTheme;
}

/**
 * Заголовок комплекта в разделе наполнения по комплектам: полоса акцента,
 * название и под ним подпись поставки. Один текстовый блок: название и подпись
 * не расходятся по листам. Держится вместе с первой группой комплекта —
 * связку собирает HeadWithFirst.
 */
export const ComplectHead: FC<ComplectHeadProps> = ({
    title,
    supplyName,
    theme,
}) => {
    const styles = infoblocksStyles(theme);
    return (
        <View style={styles.complectHead}>
            <Text style={styles.complectTitle}>
                {title}
                {title && supplyName ? '\n' : null}
                {supplyName ? (
                    <Text style={styles.complectSupply}>{supplyName}</Text>
                ) : null}
            </Text>
        </View>
    );
};
