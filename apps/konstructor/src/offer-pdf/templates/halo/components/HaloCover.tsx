import type { FC } from 'react';
import { BrandCover } from '../../kit/cover/BrandCover';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { HALO_ASSETS } from '../halo.theme';
import { haloCoverStyles } from './halo-cover.styles';

/** Титульник «Ореола»: кольца посередине, текст сверху, люди — над коралловой чертой */
export const HaloCover: FC<OfferPdfChromeProps> = ({ model, theme }) => (
    <BrandCover
        model={model}
        theme={theme}
        background={model.assets?.images[HALO_ASSETS.cover]}
        styles={haloCoverStyles(theme)}
        logoColor={theme.colors.accentStrong ?? theme.colors.accent}
    />
);
