import type { FC } from 'react';
import type { OfferPdfChromeProps } from '../document/offer-pdf-chrome';
import { GARANT_PROMO } from './garant-promo';
import { PromoBlock } from './PromoBlock';

/** Промо-страница с общим текстом о системе ГАРАНТ — для стилей без своего промо */
export const GarantPromo: FC<OfferPdfChromeProps> = ({ theme }) => (
    <PromoBlock promo={GARANT_PROMO} theme={theme} />
);
