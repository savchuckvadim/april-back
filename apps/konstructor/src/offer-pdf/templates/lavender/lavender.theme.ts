import { OFFER_PDF_FONTS } from '../../fonts/offer-pdf-fonts';
import type { OfferPdfPalettes } from '../kit/theme/offer-pdf-palette';
import type { OfferPdfTheme } from '../kit/theme/offer-pdf-theme';

interface LavenderColors {
    accent: string;
    strong: string;
    soft: string;
    gradient: readonly [string, string];
}

/**
 * «Лаванда»: светлый титульник в мягком градиенте (набор 8 из Canva
 * владельца), на листах — полоса градиента под шапкой. Manrope, заголовки
 * полужирные. Градиент вектором — гаммы без новых картинок.
 */
const lavenderTheme = (
    code: string,
    colors: LavenderColors,
): OfferPdfTheme => ({
    code: `lavender-${code}`,
    colors: {
        text: '#241F33',
        muted: '#6B6580',
        accent: colors.accent,
        danger: '#C8283C',
        line: '#E4E0EE',
        shade: colors.soft,
        tableBorder: '#C9C3D8',
        accentSoft: colors.soft,
        accentStrong: colors.strong,
        gradient: colors.gradient,
    },
    sizes: { xs: 7, sm: 8, base: 9.5, lg: 11, h2: 16, h1: 34 },
    page: {
        paddingTop: 92,
        paddingBottom: 66,
        paddingHorizontal: 46,
        edge: 26,
    },
    fonts: {
        body: OFFER_PDF_FONTS.manrope,
        heading: OFFER_PDF_FONTS.manrope,
        headingWeight: 600,
    },
    lineHeight: 1.45,
    footer: {
        border: { width: 0.75, color: colors.soft },
        nameColor: colors.accent,
    },
});

/** Гаммы «Лаванды»: лаванда — по умолчанию */
export const LAVENDER_PALETTES: OfferPdfPalettes = [
    {
        code: 'lavender',
        name: 'Лаванда',
        swatch: '#B9A5E8',
        theme: lavenderTheme('lavender', {
            accent: '#6A4FC2',
            strong: '#3F2C86',
            soft: '#F1ECFB',
            gradient: ['#C9B8F2', '#F6CBE3'],
        }),
    },
    {
        code: 'mint',
        name: 'Мята',
        swatch: '#8FD8C3',
        theme: lavenderTheme('mint', {
            accent: '#23826B',
            strong: '#145746',
            soft: '#E8F6F1',
            gradient: ['#A8E3D2', '#E3F5C8'],
        }),
    },
    {
        code: 'peach',
        name: 'Персик',
        swatch: '#F5B394',
        theme: lavenderTheme('peach', {
            accent: '#C25A2C',
            strong: '#86391A',
            soft: '#FCEEE6',
            gradient: ['#F8C0A4', '#FCE6B9'],
        }),
    },
];
