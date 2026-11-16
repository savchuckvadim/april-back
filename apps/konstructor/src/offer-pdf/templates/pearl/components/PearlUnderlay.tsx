import type { FC } from 'react';
import { SheetBackground } from '../../kit/decor/SheetBackground';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { PEARL_ASSETS } from '../pearl.theme';

/** Подложка листов «Перламутра»: пастельная полоса сверху */
export const PearlUnderlay: FC<OfferPdfChromeProps> = ({ model }) => (
    <SheetBackground image={model.assets?.images[PEARL_ASSETS.sheet]} />
);
