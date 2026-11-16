import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { GARANT_PROMO } from '../../kit/promo/garant-promo';
import { PromoItem } from '../../kit/promo/PromoItem';
import { RichText } from '../../shared/RichText';
import { pearlPromoStyles } from './pearl-promo.styles';

/**
 * Страница о системе «Перламутра»: заголовок и вступление — на
 * перламутровой шапке листа, пункты — двумя колонками на чистом поле под
 * ней. Карточки здесь нет: лист сам делит страницу на две части.
 */
export const PearlPromo: FC<OfferPdfChromeProps> = ({ theme }) => {
    const styles = pearlPromoStyles(theme);
    const { accent, danger } = theme.colors;
    const promo = GARANT_PROMO;
    return (
        <View>
            <View style={styles.hero}>
                <Text style={styles.kicker}>О системе</Text>
                <Text style={styles.title}>{promo.title}</Text>
                {promo.lead ? (
                    <RichText
                        text={promo.lead}
                        style={styles.lead}
                        accentColor={accent}
                        dangerColor={danger}
                    />
                ) : null}
            </View>
            <View style={styles.items}>
                {promo.items.map(item => (
                    <PromoItem
                        key={item.title}
                        item={item}
                        theme={theme}
                        style={styles.item}
                    />
                ))}
            </View>
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
