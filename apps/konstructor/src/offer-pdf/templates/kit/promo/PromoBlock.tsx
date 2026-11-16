import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { RichText } from '../../shared/RichText';
import { surfaceOnly } from '../document/surface.styles';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { promoStyles } from './promo.styles';
import type { OfferPdfPromo } from './promo.types';

export interface PromoBlockProps {
    promo: OfferPdfPromo;
    theme: OfferPdfTheme;
}

/** Промо-страница: заголовок, вступление, пункты с акцентной чертой, заключение */
export const PromoBlock: FC<PromoBlockProps> = ({ promo, theme }) => {
    const styles = promoStyles(theme);
    const { accent, danger } = theme.colors;
    return (
        <View style={surfaceOnly(theme)}>
            <Text style={styles.title}>{promo.title}</Text>
            {promo.lead ? (
                <RichText
                    text={promo.lead}
                    style={styles.lead}
                    accentColor={accent}
                    dangerColor={danger}
                />
            ) : null}
            {promo.items.map(item => (
                <View key={item.title} style={styles.item} wrap={false}>
                    <View style={styles.mark} />
                    <View style={styles.itemBody}>
                        <Text style={styles.itemTitle}>{item.title}</Text>
                        <RichText
                            text={item.text}
                            style={styles.itemText}
                            accentColor={accent}
                            dangerColor={danger}
                            paragraphGap={3}
                        />
                    </View>
                </View>
            ))}
            {promo.note ? (
                <RichText
                    text={promo.note}
                    style={styles.note}
                    accentColor={accent}
                    dangerColor={danger}
                />
            ) : null}
        </View>
    );
};
