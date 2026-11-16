import { OFFER_PDF_FONTS } from '../../fonts/offer-pdf-fonts';
import type { OfferPdfTheme } from '../kit/theme/offer-pdf-theme';

/** Картинки «Ореола» в storage/app/konstructor/offer-pdf */
export const HALO_ASSETS = { cover: 'halo/cover.jpg' } as const;

/** Толщина коралловой черты под шапкой и в подвале */
export const HALO_LINE_HEIGHT = 2.5;

/**
 * «Ореол»: размытые кольца и коралловая черта на титульнике (набор 10 из
 * Canva владельца), на листах — коралловая градиентная черта под шапкой и
 * в подвале. Заголовки — Montserrat, текст — PT Sans.
 */
export const HALO_THEME: OfferPdfTheme = {
    code: 'halo',
    colors: {
        text: '#1E1B24',
        muted: '#6B6573',
        accent: '#E2436B',
        danger: '#C8283C',
        line: '#F1DDE3',
        shade: '#FDEDF1',
        tableBorder: '#E5C3CD',
        accentSoft: '#FDEDF1',
        accentStrong: '#A8244A',
        gradient: ['#F59A5B', '#E8336D'],
    },
    sizes: { xs: 7.5, sm: 8.5, base: 10, lg: 11.5, h2: 15, h1: 30 },
    page: {
        paddingTop: 92,
        paddingBottom: 66,
        paddingHorizontal: 46,
        edge: 28,
    },
    fonts: {
        body: OFFER_PDF_FONTS.ptSans,
        heading: OFFER_PDF_FONTS.montserrat,
    },
    lineHeight: 1.35,
    footer: { gradientHeight: HALO_LINE_HEIGHT },
};
