import type { FC } from 'react';
import { SheetBackground } from '../../kit/decor/SheetBackground';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { PEARL_ASSETS } from '../pearl.theme';

/** Подложка листов «Перламутра»: перламутр во весь лист, разделы — на белых карточках */
export const PearlUnderlay: FC<OfferPdfChromeProps> = ({ model }) => (
    <SheetBackground image={model.assets?.images[PEARL_ASSETS.glow]} />
);
