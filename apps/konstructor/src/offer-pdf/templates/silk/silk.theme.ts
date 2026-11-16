import { OFFER_PDF_FONTS } from '../../fonts/offer-pdf-fonts';
import type { OfferPdfTheme } from '../kit/theme/offer-pdf-theme';

/** Картинки «Шёлка» в storage/app/konstructor/offer-pdf */
export const SILK_ASSETS = { cover: 'silk/cover.jpg' } as const;

/** Насколько бледнее волны под текстом листов */
export const SILK_SHEET_OPACITY = 0.3;

/**
 * «Шёлк»: золотые линии-волны (набор 13 из Canva владельца) — ярко на
 * титульнике, бледно под белыми карточками на листах. Заголовки —
 * Montserrat обычного начертания, текст — PT Sans.
 */
export const SILK_THEME: OfferPdfTheme = {
    code: 'silk',
    colors: {
        text: '#231E16',
        muted: '#6E6555',
        accent: '#A87B2A',
        danger: '#B3261E',
        line: '#EADCC0',
        shade: '#FBF6EA',
        tableBorder: '#D9C8A3',
        accentSoft: '#FBF6EA',
        accentStrong: '#6E4E14',
    },
    sizes: { xs: 7.5, sm: 8.5, base: 10, lg: 11.5, h2: 16, h1: 26 },
    page: {
        paddingTop: 92,
        paddingBottom: 66,
        paddingHorizontal: 46,
        edge: 28,
    },
    fonts: {
        body: OFFER_PDF_FONTS.ptSans,
        heading: OFFER_PDF_FONTS.montserrat,
        headingWeight: 400,
    },
    lineHeight: 1.35,
    surface: {
        background: '#FFFFFF',
        radius: 8,
        padding: 14,
        borderColor: '#EADCC0',
    },
};
