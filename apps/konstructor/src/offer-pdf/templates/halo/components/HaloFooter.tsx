import type { FC } from 'react';
import { ManagerFooter } from '../../kit/chrome/ManagerFooter';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { HaloLine } from './HaloLine';

/** Подвал «Ореола»: коралловая черта и менеджер */
export const HaloFooter: FC<OfferPdfChromeProps> = ({ model, theme }) => (
    <ManagerFooter
        model={model}
        theme={theme}
        line={<HaloLine theme={theme} id="halo-footer" />}
    />
);
