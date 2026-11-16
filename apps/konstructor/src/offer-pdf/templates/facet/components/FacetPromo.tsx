import type { FC } from 'react';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { GARANT_PROMO } from '../../kit/promo/garant-promo';
import { PromoBlock } from '../../kit/promo/PromoBlock';

/** Промо «Грани»: общий текст о системе ГАРАНТ */
export const FacetPromo: FC<OfferPdfChromeProps> = ({ theme }) => (
    <PromoBlock promo={GARANT_PROMO} theme={theme} />
);
