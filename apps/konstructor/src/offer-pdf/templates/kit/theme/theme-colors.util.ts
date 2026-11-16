import type { OfferPdfTheme } from './offer-pdf-theme';

/** Насыщенный акцент гаммы; у темы без него — обычный акцент */
export const strongAccent = ({ colors }: OfferPdfTheme): string =>
    colors.accentStrong ?? colors.accent;

/** Цвет тёмного титульника и полос в его цвет; не задан — акцент */
export const coverPaperColor = ({ colors }: OfferPdfTheme): string =>
    colors.coverPaper ?? colors.accent;

/** Цвет текста и логотипа на тёмном титульнике; не задан — белый */
export const coverTextColor = ({ colors }: OfferPdfTheme): string =>
    colors.coverText ?? '#FFFFFF';
