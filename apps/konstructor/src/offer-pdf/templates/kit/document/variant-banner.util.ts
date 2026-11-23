import { contentWidth, type OfferPdfTheme } from '../theme/offer-pdf-theme';
import {
    VARIANT_BANNER_GAP,
    VARIANT_BANNER_LINE_HEIGHT,
    variantBannerSize,
} from './variant-banner.styles';

/** Средняя ширина символа в долях кегля — заведомо больше настоящей */
const CHAR_WIDTH = 0.6;

/**
 * Высота названия варианта до раскладки — чтобы письмо с ценами не вылезло
 * за лист (priceFitsLetterSheet). Оценка с запасом: строк выходит не меньше
 * настоящего. Нет названия — 0.
 */
export const estimateVariantBannerHeight = (
    theme: OfferPdfTheme,
    title: string | null,
): number => {
    if (!title) return 0;
    const size = variantBannerSize(theme.sizes.lg);
    const perLine = Math.max(
        10,
        Math.floor(contentWidth(theme) / (size * CHAR_WIDTH)),
    );
    const lines = Math.ceil(title.length / perLine);
    return Math.ceil(
        lines * size * VARIANT_BANNER_LINE_HEIGHT + VARIANT_BANNER_GAP,
    );
};
