import type { FC } from 'react';
import { Image } from '@react-pdf/renderer';
import type { OfferPdfImage } from '../../../model/offer-pdf-document.model';
import type { OfferPdfPromoItem } from '../../kit/promo/promo.types';
import { PromoItem } from '../../kit/promo/PromoItem';
import type { OfferPdfTheme } from '../../kit/theme/offer-pdf-theme';
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
}) => (
    <PromoItem
        item={item}
        theme={theme}
        style={iskraPromoStyles.item}
        mark={icon ? <Image style={iskraPromoStyles.icon} src={icon} /> : null}
    />
);
