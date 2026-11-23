import { contentWidth, type OfferPdfTheme } from '../theme/offer-pdf-theme';
import {
    ALTERNATIVE_BLOCK_MARGIN_BOTTOM,
    ALTERNATIVE_BLOCK_MARGIN_TOP,
    ALTERNATIVE_SET_MARGIN_BOTTOM,
    ALTERNATIVE_SET_MARGIN_TOP,
    ALTERNATIVE_SET_PADDING_HORIZONTAL,
    ALTERNATIVE_SET_PADDING_VERTICAL,
    COMPLECT_TITLE_LINE_HEIGHT,
    complectTitleSize,
} from './infoblocks.layout';

/** Средняя ширина символа в долях кегля — заведомо больше настоящей */
const CHAR_WIDTH = 0.6;

/** Высота строки не ниже интерлиньяжа обёртки: заголовок наследует его от неё */
const lineOf = (
    theme: OfferPdfTheme,
    size: number,
    lineHeight: number,
): number => Math.max(size * lineHeight, theme.sizes.base * theme.lineHeight);

/**
 * Высота заголовка блока «Наполнение наборов для сравнения» до раскладки — для
 * места под начало длинного пункта (метка разрыва перед ним). Заголовок в
 * одну строку: название блока короткое.
 */
export const estimateAlternativeBlockHeadHeight = (
    theme: OfferPdfTheme,
): number =>
    Math.ceil(
        lineOf(theme, theme.sizes.h2, COMPLECT_TITLE_LINE_HEIGHT) +
            ALTERNATIVE_BLOCK_MARGIN_TOP +
            ALTERNATIVE_BLOCK_MARGIN_BOTTOM,
    );

/**
 * Высота плашки набора до раскладки. Оценка с запасом: строк выходит не
 * меньше настоящего.
 */
export const estimateAlternativeSetHeadHeight = (
    theme: OfferPdfTheme,
    title: string,
): number => {
    const size = complectTitleSize(theme.sizes.lg);
    const width = contentWidth(theme) - ALTERNATIVE_SET_PADDING_HORIZONTAL * 2;
    const perLine = Math.max(10, Math.floor(width / (size * CHAR_WIDTH)));
    const lines = Math.max(1, Math.ceil(title.length / perLine));
    return Math.ceil(
        lines * lineOf(theme, size, COMPLECT_TITLE_LINE_HEIGHT) +
            ALTERNATIVE_SET_PADDING_VERTICAL * 2 +
            ALTERNATIVE_SET_MARGIN_TOP +
            ALTERNATIVE_SET_MARGIN_BOTTOM,
    );
};
