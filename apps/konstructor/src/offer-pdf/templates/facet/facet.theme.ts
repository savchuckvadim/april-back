import { OFFER_PDF_FONTS } from '../../fonts/offer-pdf-fonts';
import type { OfferPdfPalettes } from '../kit/theme/offer-pdf-palette';
import type { OfferPdfTheme } from '../kit/theme/offer-pdf-theme';

interface FacetColors {
    accent: string;
    strong: string;
    soft: string;
    cover: string;
}

/**
 * «Грань»: тёмный титульник с диагональными гранями (набор 3 из Canva
 * владельца), внутри белые листы с полосой-шапкой в цвет гаммы. Заголовки —
 * Montserrat, текст — PT Sans.
 */
const facetTheme = (code: string, colors: FacetColors): OfferPdfTheme => ({
    code: `facet-${code}`,
    colors: {
        text: '#16181D',
        muted: '#5D6470',
        accent: colors.accent,
        danger: '#D52B1E',
        line: '#DDE2EA',
        shade: colors.soft,
        tableBorder: '#B9C2D0',
        accentSoft: colors.soft,
        accentStrong: colors.strong,
        coverPaper: colors.cover,
        coverText: '#FFFFFF',
    },
    sizes: { xs: 7.5, sm: 8.5, base: 10, lg: 11.5, h2: 15, h1: 34 },
    page: {
        paddingTop: 96,
        paddingBottom: 66,
        paddingHorizontal: 44,
        edge: 26,
    },
    fonts: {
        body: OFFER_PDF_FONTS.ptSans,
        heading: OFFER_PDF_FONTS.montserrat,
    },
    lineHeight: 1.35,
});

/** Гаммы «Грани»: синий Гаранта — по умолчанию */
export const FACET_PALETTES: OfferPdfPalettes = [
    {
        code: 'garant',
        name: 'Синий Гаранта',
        swatch: '#1F4E9C',
        theme: facetTheme('garant', {
            accent: '#2A5DB0',
            strong: '#163A78',
            soft: '#E9EFF9',
            cover: '#14295A',
        }),
    },
    {
        code: 'claret',
        name: 'Бордо',
        swatch: '#9E1F2E',
        theme: facetTheme('claret', {
            accent: '#B3263A',
            strong: '#7A1424',
            soft: '#F8E9EC',
            cover: '#4A0F1A',
        }),
    },
    {
        code: 'graphite',
        name: 'Графит',
        swatch: '#3E4654',
        theme: facetTheme('graphite', {
            accent: '#4A5568',
            strong: '#252B36',
            soft: '#EDEFF3',
            cover: '#1B1F27',
        }),
    },
];
