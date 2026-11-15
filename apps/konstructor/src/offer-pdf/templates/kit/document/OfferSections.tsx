import type { FC } from 'react';
import { OfferInfoblocks } from '../infoblocks';
import { OfferPrice } from '../price/OfferPrice';
import { OfferStamps } from '../stamps/OfferStamps';
import { offerSectionOrder } from './document.util';
import type { OfferPdfChromeProps } from './offer-pdf-chrome';

const SECTIONS = {
    price: OfferPrice,
    stamps: OfferStamps,
    infoblocks: OfferInfoblocks,
} as const;

/** Разделы КП после письма — в порядке из настроек */
export const OfferSections: FC<OfferPdfChromeProps> = ({ model, theme }) => (
    <>
        {offerSectionOrder(model.settings).map(key => {
            const Section = SECTIONS[key];
            return <Section key={key} model={model} theme={theme} />;
        })}
    </>
);
