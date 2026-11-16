import type { FC } from 'react';
import { GARANT_PINK } from '../../kit/brand/brand-colors';
import { BrandHeader } from '../../kit/chrome/BrandHeader';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { ISKRA_PURPLE } from '../iskra.theme';

/** Шапка «Искры»: логотипы Гаранта и Искры в фирменных цветах, компания, дата */
export const IskraHeader: FC<OfferPdfChromeProps> = ({ model, theme }) => (
    <BrandHeader
        model={model}
        theme={theme}
        logoColor={GARANT_PINK}
        iscraColor={ISKRA_PURPLE}
    />
);
