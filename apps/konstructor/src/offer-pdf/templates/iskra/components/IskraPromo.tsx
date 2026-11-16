import type { FC } from 'react';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { PromoBlock } from '../../kit/promo/PromoBlock';
import { ISKRA_PROMO, ISKRA_PROMO_ICONS } from '../iskra-promo';
import { IskraPromoItem } from './IskraPromoItem';

/** Страница о сервисе «Искра»: что умеет нейросеть — тексты вордовского шаблона */
export const IskraPromo: FC<OfferPdfChromeProps> = ({ model, theme }) => {
    const images = model.assets?.images;
    return (
        <PromoBlock
            promo={ISKRA_PROMO}
            theme={theme}
            renderItem={(item, index) => {
                const icon = ISKRA_PROMO_ICONS[index];
                return (
                    <IskraPromoItem
                        item={item}
                        icon={icon ? images?.[icon] : undefined}
                        theme={theme}
                    />
                );
            }}
        />
    );
};
