import type { FC } from 'react';
import { SheetBackground } from '../../kit/decor/SheetBackground';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { SILK_ASSETS, SILK_SHEET_OPACITY } from '../silk.theme';

/** Подложка листов «Шёлка»: те же волны, бледно — разделы лежат на карточках */
export const SilkUnderlay: FC<OfferPdfChromeProps> = ({ model }) => (
    <SheetBackground
        image={model.assets?.images[SILK_ASSETS.cover]}
        opacity={SILK_SHEET_OPACITY}
    />
);
