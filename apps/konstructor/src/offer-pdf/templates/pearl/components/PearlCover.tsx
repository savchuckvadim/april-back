import type { FC } from 'react';
import { BrandCover } from '../../kit/cover/BrandCover';
import { SheetBackground } from '../../kit/decor/SheetBackground';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { PEARL_ASSETS } from '../pearl.theme';
import { pearlCoverStyles } from './pearl-cover.styles';

/** Титульник «Перламутра»: перламутровое стекло в углах, текст слева */
export const PearlCover: FC<OfferPdfChromeProps> = ({ model, theme }) => (
    <BrandCover
        model={model}
        theme={theme}
        styles={pearlCoverStyles(theme)}
        background={
            <SheetBackground image={model.assets?.images[PEARL_ASSETS.cover]} />
        }
    />
);
