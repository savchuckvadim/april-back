import type { OfferPdfTheme } from './offer-pdf-theme';

/**
 * Гамма стиля: та же вёрстка в другом цвете. Менеджер выбирает её рядом со
 * стилем; у стиля без гамм тема одна.
 */
export interface OfferPdfPalette {
    /** Код гаммы — приходит в запросе (`palette`) */
    readonly code: string;
    /** Название для выбора: «Синий Гаранта» */
    readonly name: string;
    /** Цвет кружка в выборе */
    readonly swatch: string;
    readonly theme: OfferPdfTheme;
}

/** Гамма для списка стилей — без темы */
export interface OfferPdfPaletteInfo {
    code: string;
    name: string;
    swatch: string;
}

/** Выбранная гамма; неизвестная или не задана — первая */
export const findPalette = (
    palettes: readonly OfferPdfPalette[],
    code: string | null | undefined,
): OfferPdfPalette | undefined =>
    palettes.find(palette => palette.code === code) ?? palettes[0];

/** Гаммы стиля: хотя бы одна, первая — по умолчанию */
export type OfferPdfPalettes = readonly [OfferPdfPalette, ...OfferPdfPalette[]];

/** Тема выбранной гаммы; неизвестная или не задана — первой */
export const paletteTheme = (
    palettes: OfferPdfPalettes,
    code: string | null | undefined,
): OfferPdfTheme =>
    (palettes.find(palette => palette.code === code) ?? palettes[0]).theme;

export const paletteInfo = ({
    code,
    name,
    swatch,
}: OfferPdfPalette): OfferPdfPaletteInfo => ({ code, name, swatch });
