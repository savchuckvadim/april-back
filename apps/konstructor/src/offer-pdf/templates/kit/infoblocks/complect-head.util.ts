import { contentWidth, type OfferPdfTheme } from '../theme/offer-pdf-theme';
import {
    COMPLECT_HEAD_BAR,
    COMPLECT_HEAD_MARGIN_BOTTOM,
    COMPLECT_HEAD_MARGIN_TOP,
    COMPLECT_HEAD_MARGIN_TOP_UNDER_SET,
    COMPLECT_HEAD_PADDING,
    COMPLECT_TITLE_LINE_HEIGHT,
    complectTitleSize,
} from './infoblocks.layout';

/** Средняя ширина символа в долях кегля — заведомо больше настоящей */
const CHAR_WIDTH = 0.6;

/**
 * Высота заголовка комплекта до раскладки — для места под начало длинного
 * пункта (метка разрыва перед ним). Оценка с запасом: строк выходит не
 * меньше настоящего. Название переносится по ширине, подпись поставки — одна
 * строка. Отступ сверху меньше, когда над заголовком плашка набора для
 * сравнения (`underSet`).
 */
export const estimateComplectHeadHeight = (
    theme: OfferPdfTheme,
    title: string,
    supplyName: string,
    underSet = false,
): number => {
    const size = complectTitleSize(theme.sizes.lg);
    const width =
        contentWidth(theme) - COMPLECT_HEAD_BAR - COMPLECT_HEAD_PADDING;
    const perLine = Math.max(10, Math.floor(width / (size * CHAR_WIDTH)));
    const titleLines = title ? Math.ceil(title.length / perLine) : 0;
    const lines = titleLines + (supplyName ? 1 : 0);
    // строка не ниже интерлиньяжа обёртки: заголовок наследует его от неё
    const line = Math.max(
        size * COMPLECT_TITLE_LINE_HEIGHT,
        theme.sizes.base * theme.lineHeight,
    );
    const marginTop = underSet
        ? COMPLECT_HEAD_MARGIN_TOP_UNDER_SET
        : COMPLECT_HEAD_MARGIN_TOP;
    return Math.ceil(lines * line + marginTop + COMPLECT_HEAD_MARGIN_BOTTOM);
};
