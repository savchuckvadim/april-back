import type { FC } from 'react';
import { OfferPdfDocumentModel } from '../../../model/offer-pdf-document.model';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';

export interface OfferPdfChromeProps {
    model: OfferPdfDocumentModel;
    theme: OfferPdfTheme;
}

/**
 * Что стиль рисует сам. Общие блоки (письмо, цена, наполнение, подпись)
 * берутся из kit и красятся темой; оформление листа — здесь.
 */
export interface OfferPdfChrome {
    /** Шапка каждой страницы (fixed): её высота задаёт верхнее поле */
    Header: FC<OfferPdfChromeProps>;
    /** Подвал каждой страницы (fixed): его высота задаёт нижнее поле */
    Footer: FC<OfferPdfChromeProps>;
    /** Титульный лист — отдельная страница без шапки и подвала */
    Cover?: FC<OfferPdfChromeProps>;
    /** Подложка под текстом на каждой странице (fixed, во всю страницу или у края) */
    Underlay?: FC<OfferPdfChromeProps>;
}
