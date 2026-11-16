import type { FC } from 'react';
import { BrandCover } from '../../kit/cover/BrandCover';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { SILK_ASSETS } from '../silk.theme';
import { silkCoverStyles } from './silk-cover.styles';

/** Титульник «Шёлка»: золотые волны, текст в свободных местах между ними */
export const SilkCover: FC<OfferPdfChromeProps> = ({ model, theme }) => (
    <BrandCover
        model={model}
        theme={theme}
        background={model.assets?.images[SILK_ASSETS.cover]}
        styles={silkCoverStyles(theme)}
        logoColor={theme.colors.accentStrong ?? theme.colors.accent}
    />
);
