import type { FC } from 'react';
import { BrandHeader } from '../../kit/chrome/BrandHeader';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { GARANT_PINK, ISKRA_PURPLE } from '../iskra.theme';

/** Шапка «Искры»: логотипы Гаранта и Искры в фирменных цветах, компания, дата */
export const IskraHeader: FC<OfferPdfChromeProps> = ({ model, theme }) => (
    <BrandHeader
        model={model}
        theme={theme}
        logoColor={GARANT_PINK}
        iscraColor={ISKRA_PURPLE}
    />
);
