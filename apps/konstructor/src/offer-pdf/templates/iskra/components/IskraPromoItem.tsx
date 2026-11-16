import type { FC } from 'react';
import { Image, Text, View } from '@react-pdf/renderer';
import type { OfferPdfImage } from '../../../model/offer-pdf-document.model';
import type { OfferPdfPromoItem } from '../../kit/promo/promo.types';
import { promoStyles } from '../../kit/promo/promo.styles';
import type { OfferPdfTheme } from '../../kit/theme/offer-pdf-theme';
import { RichText } from '../../shared/RichText';
import { iskraPromoStyles } from './iskra-promo.styles';

export interface IskraPromoItemProps {
    item: OfferPdfPromoItem;
    /** 3D-иконка; нет файла — пункт без иконки */
    icon: OfferPdfImage | undefined;
    theme: OfferPdfTheme;
}

/** Пункт «что умеет Искра»: иконка, заголовок и текст */
export const IskraPromoItem: FC<IskraPromoItemProps> = ({
    item,
    icon,
    theme,
}) => {
    const styles = iskraPromoStyles(theme);
    const text = promoStyles(theme);
    return (
        <View style={styles.item} wrap={false}>
            {icon ? <Image style={styles.icon} src={icon} /> : null}
            <View style={styles.body}>
                <Text style={text.itemTitle}>{item.title}</Text>
                <RichText
                    text={item.text}
                    style={text.itemText}
                    accentColor={theme.colors.accent}
                    dangerColor={theme.colors.danger}
                    paragraphGap={3}
                />
            </View>
        </View>
    );
};
