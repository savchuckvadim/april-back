import { OFFER_PDF_FONTS } from '../../fonts/offer-pdf-fonts';
import type { OfferPdfTheme } from '../kit/theme/offer-pdf-theme';

/**
 * «Монохром»: тёплый серый лист, чёрный текст, тонкие заголовки Manrope,
 * чёрная вкладка у правого края (референс — Canva «Startup Business Plan»,
 * избранное владельца, 15.11). Цвета нет совсем: акцент и «важное» в письме
 * — тот же чёрный, выделяет их жирность.
 */
export const MONOCHROME_THEME: OfferPdfTheme = {
    code: 'monochrome',
    colors: {
        text: '#111111',
        muted: '#5F5F5C',
        accent: '#111111',
        danger: '#111111',
        line: '#C9C9C4',
        shade: '#E2E2DE',
        tableBorder: '#B5B5B0',
        paper: '#EFEFED',
    },
    sizes: {
        xs: 7,
        sm: 8,
        base: 9.5,
        lg: 11,
        h2: 20,
        h1: 46,
    },
    page: {
        paddingTop: 84,
        paddingBottom: 70,
        paddingHorizontal: 48,
        edge: 28,
    },
    fonts: {
        body: OFFER_PDF_FONTS.manrope,
        heading: OFFER_PDF_FONTS.manrope,
        headingWeight: 300,
    },
    lineHeight: 1.45,
};
