import type { FC } from 'react';
import { GradientLine } from '../../kit/decor/GradientLine';
import {
    contentWidth,
    type OfferPdfTheme,
} from '../../kit/theme/offer-pdf-theme';

export interface HaloLineProps {
    theme: OfferPdfTheme;
    id: string;
}

/** Коралловая черта «Ореола» во всю ширину полосы набора */
export const HaloLine: FC<HaloLineProps> = ({ theme, id }) =>
    theme.colors.gradient ? (
        <GradientLine
            id={id}
            width={contentWidth(theme)}
            height={2.5}
            colors={theme.colors.gradient}
        />
    ) : null;
