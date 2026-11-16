import type { FC } from 'react';
import { OfferInfoblocks } from '../infoblocks';
import { OfferPrice } from '../price/OfferPrice';
import { OfferStamps } from '../stamps/OfferStamps';
import type { OfferSectionKey } from './document.util';
import type { OfferPdfChromeProps } from './offer-pdf-chrome';

const SECTIONS = {
    price: OfferPrice,
    stamps: OfferStamps,
    infoblocks: OfferInfoblocks,
} as const;

export interface OfferSectionsProps extends OfferPdfChromeProps {
    /** Разделы одного потока листов — в порядке печати */
    keys: readonly OfferSectionKey[];
}

/** Разделы КП одного потока листов */
export const OfferSections: FC<OfferSectionsProps> = ({
    model,
    theme,
    keys,
}) => (
    <>
        {keys.map(key => {
            const Section = SECTIONS[key];
            return <Section key={key} model={model} theme={theme} />;
        })}
    </>
);
