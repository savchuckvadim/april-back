import { OFFER_PDF_FONTS } from '../../fonts/offer-pdf-fonts';
import type { OfferPdfTheme } from '../kit/theme/offer-pdf-theme';

/** Картинки «Искры» (из вордовского шаблона) в storage/app/konstructor/offer-pdf */
export const ISKRA_ASSETS = {
    knot: 'iskra/knot.jpg',
    flame: 'iskra/flame.jpg',
    rocket: 'iskra/rocket.jpg',
    trophy: 'iskra/trophy.jpg',
    coins: 'iskra/coins.jpg',
} as const;

/** Фирменный цвет логотипа Искры, как во вордовском шаблоне */
export const ISKRA_PURPLE = '#A02B93';

/**
 * «Искра» — перенос вордовского шаблона для КП с сервисом «Искра»:
 * оранжевый узел, логотипы Гаранта и Искры, страница о сервисе, наполнение
 * в две колонки. Заголовки — Montserrat, текст — PT Sans.
 */
export const ISKRA_THEME: OfferPdfTheme = {
    code: 'iskra',
    colors: {
        text: '#1D1A22',
        muted: '#6A6470',
        accent: '#F26A1B',
        danger: '#E4003A',
        line: '#F3E2D6',
        shade: '#FFF1E6',
        tableBorder: '#E7CDBB',
        accentSoft: '#FFF1E6',
        accentStrong: ISKRA_PURPLE,
        gradient: ['#FF9A3C', '#FF3D6E'],
    },
    sizes: { xs: 7.5, sm: 8.5, base: 10, lg: 11.5, h2: 16, h1: 30 },
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
    infoblocks: { namesColumns: 2 },
};

/**
 * Заголовок титульника — перенос задан явно: на дефисе «AI-ассистент»
 * react-pdf рвёт строку и добавляет свой дефис («AI--»).
 */
export const ISKRA_COVER_TITLE = 'Правовой\nAI-ассистент ИСКРА';
