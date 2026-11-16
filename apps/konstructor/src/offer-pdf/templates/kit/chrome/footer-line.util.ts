import type { OfferPdfTheme } from '../theme/offer-pdf-theme';

/** Толщина градиентной черты, если стиль не задал свою */
const GRADIENT_HEIGHT = 2;

/** Чем подвал отделён от текста листа */
export type FooterLineKind = 'border' | 'gradient' | 'accent';

/**
 * Черта подвала по теме: рамка, если стиль её задал; у темы с градиентом —
 * градиентная черта; у остальных — линия акцента.
 */
export const footerLineKind = ({
    footer,
    colors,
}: OfferPdfTheme): FooterLineKind => {
    if (footer?.border) return 'border';
    return colors.gradient ? 'gradient' : 'accent';
};

export const footerGradientHeight = ({ footer }: OfferPdfTheme): number =>
    footer?.gradientHeight ?? GRADIENT_HEIGHT;
