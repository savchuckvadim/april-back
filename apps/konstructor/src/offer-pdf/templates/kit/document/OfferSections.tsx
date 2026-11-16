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

export interface OfferSectionsProps extends OfferPdfChromeProps {
    /** Подпись уже стоит под письмом на промо-странице — здесь её нет */
    withoutStamps?: boolean;
}

/** Разделы КП после письма — в порядке из настроек */
export const OfferSections: FC<OfferSectionsProps> = ({
    model,
    theme,
    withoutStamps = false,
}) => (
    <>
        {offerSectionOrder(model.settings)
            .filter(key => !(withoutStamps && key === 'stamps'))
            .map(key => {
                const Section = SECTIONS[key];
                return <Section key={key} model={model} theme={theme} />;
            })}
    </>
);
