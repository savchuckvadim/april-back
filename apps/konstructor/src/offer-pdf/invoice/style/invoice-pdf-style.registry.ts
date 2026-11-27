import type { OfferPdfTheme } from '../../templates/kit/theme/offer-pdf-theme';
import { CLASSIC_THEME } from '../../templates/classic/classic.theme';

/**
 * Стиль счёта в PDF: код и тема (цвета, кегли, шрифты) тем же видом, что у
 * стилей КП. Вёрстка счёта у всех стилей одна и живёт в компонентах
 * `invoice/components`: форма счёта устроена по правилам бухгалтерии, а стили
 * отличаются оформлением. Новый стиль — новая запись здесь, компоненты и
 * сервисы не меняются.
 */
export interface InvoicePdfStyle {
    readonly code: string;
    /** Название для выбора в конструкторе, когда стилей станет несколько */
    readonly name: string;
    readonly theme: OfferPdfTheme;
}

/** Единственный пока стиль: палитра и шрифт «классического» КП. */
export const INVOICE_PDF_CLASSIC_STYLE: InvoicePdfStyle = {
    code: 'classic',
    name: 'Классический',
    theme: CLASSIC_THEME,
};

export const INVOICE_PDF_STYLES: readonly InvoicePdfStyle[] = [
    INVOICE_PDF_CLASSIC_STYLE,
];

export const INVOICE_PDF_DEFAULT_STYLE_CODE = INVOICE_PDF_CLASSIC_STYLE.code;

/** Стиль по коду; не задан или неизвестен — стиль по умолчанию. */
export const findInvoicePdfStyle = (code?: string | null): InvoicePdfStyle =>
    INVOICE_PDF_STYLES.find(style => style.code === code) ??
    INVOICE_PDF_CLASSIC_STYLE;
