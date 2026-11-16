import type { FC } from 'react';
import { CornerImage } from '../../kit/decor/CornerImage';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { MODERNE_ASSETS } from '../moderne.theme';
import {
    MODERNE_BOTTOM_OPACITY,
    moderneUnderlayStyles,
} from './moderne-underlay.styles';

/** Подложка листов «Модерна»: мягкие пятна в правом верхнем и левом нижнем углах */
export const ModerneUnderlay: FC<OfferPdfChromeProps> = ({ model }) => {
    const images = model.assets?.images;
    return (
        <>
            <CornerImage
                image={images?.[MODERNE_ASSETS.cornerTop]}
                style={moderneUnderlayStyles.top}
            />
            <CornerImage
                image={images?.[MODERNE_ASSETS.cornerBottom]}
                style={moderneUnderlayStyles.bottom}
                opacity={MODERNE_BOTTOM_OPACITY}
            />
        </>
    );
};
