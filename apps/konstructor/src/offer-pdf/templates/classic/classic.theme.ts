import { OFFER_PDF_FONT_FAMILY } from '../../fonts/offer-pdf-fonts';
import type { OfferPdfTheme } from '../kit/theme/offer-pdf-theme';

/**
 * Палитра и размеры «классического» КП — по старому Blade-шаблону
 * (синий акцент rgb(48,115,230), красный rgb(220,26,33), приглушённый текст).
 */
export const CLASSIC_THEME: OfferPdfTheme = {
    code: 'classic',
    colors: {
        text: '#111111',
        muted: '#55637C',
        accent: '#3073E6',
        danger: '#DC1A21',
        line: '#D7DEEA',
        shade: '#F3F6FB',
        tableBorder: '#9AA6BC',
    },
    sizes: {
        xs: 7.5,
        sm: 8.5,
        base: 10,
        lg: 11.5,
        h2: 13,
        h1: 15,
    },
    page: {
        /**
         * Поля под измеренные шапку и подвал (lib/pdf-layout, fitPageFrame): с
         * ними обычный документ рисуется за один проход, длинные реквизиты
         * или контакты менеджера раздвигают их на втором.
         */
        paddingTop: 96,
        paddingBottom: 95,
        paddingHorizontal: 44,
        edge: 26,
    },
    fonts: { body: OFFER_PDF_FONT_FAMILY, heading: OFFER_PDF_FONT_FAMILY },
    lineHeight: 1.35,
};
