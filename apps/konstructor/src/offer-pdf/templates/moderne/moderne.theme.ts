import { OFFER_PDF_FONTS } from '../../fonts/offer-pdf-fonts';
import type { OfferPdfTheme } from '../kit/theme/offer-pdf-theme';

/** Картинки «Модерна» (из вордовского шаблона) в storage/app/konstructor/offer-pdf */
export const MODERNE_ASSETS = {
    cover: 'moderne/cover.jpg',
    cornerTop: 'moderne/corner-top.jpg',
    cornerBottom: 'moderne/corner-bottom.jpg',
} as const;

/** Заголовок страницы с письмом — как во вордовском «Модерне» */
export const MODERNE_PROMO_TITLE =
    'От базы знаний к интеллектуальному помощнику';

/**
 * «Модерн» — перенос вордовского шаблона: фиолетово-синяя заливка на
 * титульнике, письмо портала отдельной страницей, наполнение в две колонки,
 * мягкие пятна в углах листов, черта фиолетовый → бирюзовый.
 */
export const MODERNE_THEME: OfferPdfTheme = {
    code: 'moderne',
    colors: {
        text: '#1C1830',
        muted: '#655F78',
        accent: '#6D28D9',
        danger: '#C8283C',
        line: '#E5E0F2',
        shade: '#F1ECFE',
        tableBorder: '#CBC2E4',
        accentSoft: '#F1ECFE',
        accentStrong: '#3B1A9C',
        gradient: ['#8E2DE2', '#1FA2B8'],
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
