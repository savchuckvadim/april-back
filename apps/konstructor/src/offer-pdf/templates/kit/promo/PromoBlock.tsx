import { Fragment, type FC, type ReactNode } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { RichText } from '../../shared/RichText';
import { surfaceOnly } from '../document/surface.styles';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { promoStyles } from './promo.styles';
import type { OfferPdfPromo, OfferPdfPromoItem } from './promo.types';
import { PromoItem } from './PromoItem';

export interface PromoBlockProps {
    promo: OfferPdfPromo;
    theme: OfferPdfTheme;
    /** Свой вид пункта (иконка и т. п.); по умолчанию — PromoItem с акцентной чертой */
    renderItem?: (item: OfferPdfPromoItem, index: number) => ReactNode;
}

/** Промо-страница: заголовок, вступление, пункты, заключение */
export const PromoBlock: FC<PromoBlockProps> = ({
    promo,
    theme,
    renderItem,
}) => {
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
            {promo.items.map((item, index) => (
                <Fragment key={item.title}>
                    {renderItem ? (
                        renderItem(item, index)
                    ) : (
                        <PromoItem item={item} theme={theme} />
                    )}
                </Fragment>
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
