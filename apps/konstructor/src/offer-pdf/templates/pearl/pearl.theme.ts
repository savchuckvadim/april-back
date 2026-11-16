import { OFFER_PDF_FONTS } from '../../fonts/offer-pdf-fonts';
import type { OfferPdfTheme } from '../kit/theme/offer-pdf-theme';

/** Картинки «Перламутра» в storage/app/konstructor/offer-pdf */
export const PEARL_ASSETS = {
    cover: 'pearl/cover.jpg',
    sheet: 'pearl/sheet.jpg',
} as const;

/**
 * «Перламутр»: перламутровое стекло на титульнике и пастельная полоса
 * сверху листов (набор 1 из Canva владельца). Разделы — на белых карточках
 * поверх фона. Manrope, заголовки полужирные.
 */
export const PEARL_THEME: OfferPdfTheme = {
    code: 'pearl',
    colors: {
        text: '#1F2233',
        muted: '#6A6F85',
        accent: '#5A62D6',
        danger: '#D2344A',
        line: '#E3E6F5',
        shade: '#EEF0FC',
        tableBorder: '#C9CDE6',
        accentSoft: '#EEF0FC',
        accentStrong: '#343A8F',
    },
    sizes: { xs: 7, sm: 8, base: 9.5, lg: 11, h2: 16, h1: 32 },
    page: {
        paddingTop: 92,
        paddingBottom: 66,
        paddingHorizontal: 46,
        edge: 28,
    },
    fonts: {
        body: OFFER_PDF_FONTS.manrope,
        heading: OFFER_PDF_FONTS.manrope,
        headingWeight: 600,
    },
    lineHeight: 1.45,
    surface: {
        background: '#FFFFFF',
        radius: 10,
        padding: 14,
        borderColor: '#E3E6F5',
    },
};
