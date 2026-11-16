import type { FC, ReactNode } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { RichText } from '../../shared/RichText';
import type { PdfStyle } from '../../shared/style.util';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { promoStyles } from './promo.styles';
import type { OfferPdfPromoItem } from './promo.types';

export interface PromoItemProps {
    item: OfferPdfPromoItem;
    theme: OfferPdfTheme;
    /** Слева от текста; не задано — акцентная черта, null — ничего */
    mark?: ReactNode;
    /** Свой стиль ряда пункта вместо общего (отступ, раскладка) */
    style?: PdfStyle;
}

/** Пункт промо-страницы: отметка слева, заголовок и текст; на лист переносится целиком */
export const PromoItem: FC<PromoItemProps> = ({ item, theme, mark, style }) => {
    const styles = promoStyles(theme);
    return (
        <View style={style ?? styles.item} wrap={false}>
            {mark === undefined ? <View style={styles.mark} /> : mark}
            <View style={styles.itemBody}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <RichText
                    text={item.text}
                    style={styles.itemText}
                    accentColor={theme.colors.accent}
                    dangerColor={theme.colors.danger}
                    paragraphGap={3}
                />
            </View>
        </View>
    );
};
