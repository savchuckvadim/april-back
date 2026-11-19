import { StyleSheet } from '@react-pdf/renderer';
import type { PdfStyle } from '../../shared/style.util';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { themedStyles } from '../theme/themed-styles';

/** Карточка раздела по теме; у темы без карточек — пусто */
export const surfaceStyles = themedStyles(({ surface }) =>
    StyleSheet.create({
        card: surface
            ? {
                  backgroundColor: surface.background,
                  borderRadius: surface.radius,
                  padding: surface.padding,
                  ...(surface.bottomPadding === undefined
                      ? {}
                      : { paddingBottom: surface.bottomPadding }),
                  ...(surface.borderColor
                      ? { borderWidth: 0.75, borderColor: surface.borderColor }
                      : {}),
              }
            : {},
    }),
);

/**
 * Тема с другим нижним полем карточек. Без карточек или без значения — та же
 * тема: обычный вывод не меняется ни на байт.
 */
export const withSurfaceBottom = (
    theme: OfferPdfTheme,
    bottom: number | undefined,
): OfferPdfTheme =>
    theme.surface && bottom !== undefined
        ? { ...theme, surface: { ...theme.surface, bottomPadding: bottom } }
        : theme;

/**
 * Стиль корня раздела на карточке. Без карточек возвращает тот же объект
 * стиля: вывод стилей без фона во весь лист не меняется ни на байт.
 */
export const onSurface = (
    theme: OfferPdfTheme,
    style: PdfStyle,
): PdfStyle | PdfStyle[] =>
    theme.surface ? [style, surfaceStyles(theme).card] : style;

/** Стиль корня без своего стиля (письмо): карточка или ничего */
export const surfaceOnly = (theme: OfferPdfTheme): PdfStyle | undefined =>
    theme.surface ? surfaceStyles(theme).card : undefined;
