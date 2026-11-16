import type { FC } from 'react';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { GARANT_PROMO } from '../../kit/promo/garant-promo';
import { PromoBlock } from '../../kit/promo/PromoBlock';

/** Промо «Лаванды»: общий текст о системе ГАРАНТ */
export const LavenderPromo: FC<OfferPdfChromeProps> = ({ theme }) => (
    <PromoBlock promo={GARANT_PROMO} theme={theme} />
);
