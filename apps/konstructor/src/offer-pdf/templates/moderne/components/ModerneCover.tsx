import type { FC } from 'react';
import { BrandCover } from '../../kit/cover/BrandCover';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { MODERNE_ASSETS } from '../moderne.theme';
import { moderneCoverStyles } from './moderne-cover.styles';
import { ModerneLine } from './ModerneLine';

/** Титульник «Модерна»: заливка сверху, комплект и поставка внизу, черта под ними */
export const ModerneCover: FC<OfferPdfChromeProps> = ({ model, theme }) => (
    <BrandCover
        model={model}
        theme={theme}
        background={model.assets?.images[MODERNE_ASSETS.cover]}
        styles={moderneCoverStyles(theme)}
        logoColor={theme.colors.accentStrong ?? theme.colors.accent}
        divider={<ModerneLine theme={theme} id="moderne-cover" width={120} />}
    />
);
