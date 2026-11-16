import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { promoStyles } from '../../kit/promo/promo.styles';
import { RichText } from '../../shared/RichText';
import { ISKRA_PROMO, ISKRA_PROMO_ICONS } from '../iskra-promo';
import { IskraPromoItem } from './IskraPromoItem';

/** Страница о сервисе «Искра»: что умеет нейросеть — тексты вордовского шаблона */
export const IskraPromo: FC<OfferPdfChromeProps> = ({ model, theme }) => {
    const styles = promoStyles(theme);
    const { accent, danger } = theme.colors;
    const images = model.assets?.images;
    return (
        <View>
            <Text style={styles.title}>{ISKRA_PROMO.title}</Text>
            {ISKRA_PROMO.lead ? (
                <RichText
                    text={ISKRA_PROMO.lead}
                    style={styles.lead}
                    accentColor={accent}
                    dangerColor={danger}
                />
            ) : null}
            {ISKRA_PROMO.items.map((item, index) => {
                const icon = ISKRA_PROMO_ICONS[index];
                return (
                    <IskraPromoItem
                        key={item.title}
                        item={item}
                        icon={icon ? images?.[icon] : undefined}
                        theme={theme}
                    />
                );
            })}
            {ISKRA_PROMO.note ? (
                <RichText
                    text={ISKRA_PROMO.note}
                    style={styles.note}
                    accentColor={accent}
                    dangerColor={danger}
                />
            ) : null}
        </View>
    );
};
