import type { FC } from 'react';
import { BrandCover } from '../../kit/cover/BrandCover';
import { SheetBackground } from '../../kit/decor/SheetBackground';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { HALO_ASSETS } from '../halo.theme';
import { haloCoverStyles } from './halo-cover.styles';

/** Титульник «Ореола»: кольца посередине, текст сверху, люди — над коралловой чертой */
export const HaloCover: FC<OfferPdfChromeProps> = ({ model, theme }) => (
    <BrandCover
        model={model}
        theme={theme}
        styles={haloCoverStyles(theme)}
        background={
            <SheetBackground image={model.assets?.images[HALO_ASSETS.cover]} />
        }
    />
);
