import { OFFER_PDF_FONT_FAMILY } from '../../fonts/offer-pdf-fonts';
import type { OfferPdfTheme } from '../kit/theme/offer-pdf-theme';

/**
 * «Современный»: белый лист, графитовый текст, малиновый акцент и полосы
 * «рифлёного стекла» (референс — избранное Canva владельца, 15.11).
 * Шрифт пока PT Sans: акцидентный гротеск с кириллицей выбирает владелец.
 */
export const MODERN_THEME: OfferPdfTheme = {
    code: 'modern',
    colors: {
        text: '#16161D',
        muted: '#6B6F7B',
        accent: '#E8336D',
        danger: '#DC1A21',
        line: '#E7E8EE',
        shade: '#FCEFF4',
        tableBorder: '#D8DAE2',
    },
    sizes: {
        xs: 7.5,
        sm: 8.5,
        base: 10,
        lg: 11.5,
        h2: 14,
        h1: 38,
    },
    page: {
        paddingTop: 76,
        paddingBottom: 70,
        paddingHorizontal: 48,
        edge: 28,
    },
    fonts: { body: OFFER_PDF_FONT_FAMILY, heading: OFFER_PDF_FONT_FAMILY },
    lineHeight: 1.4,
};

/** Холодный серый, из которого полосы уходят в акцент */
export const MODERN_STRIPE_BASE = '#B9BCC8';
