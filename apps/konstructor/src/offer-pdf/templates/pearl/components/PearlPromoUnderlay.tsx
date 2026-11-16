import type { FC } from 'react';
import { SheetBackground } from '../../kit/decor/SheetBackground';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { PEARL_ASSETS } from '../pearl.theme';

/** Лист страницы о системе: перламутровая шапка на треть страницы */
export const PearlPromoUnderlay: FC<OfferPdfChromeProps> = ({ model }) => (
    <SheetBackground image={model.assets?.images[PEARL_ASSETS.sheet]} />
);
