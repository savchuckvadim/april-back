import { StyleSheet } from '@react-pdf/renderer';
import { themedStyles } from '../theme/themed-styles';

/** Отступ под названием варианта до письма или раздела */
export const VARIANT_BANNER_GAP = 10;

/** Интерлиньяж названия варианта — по его собственному кеглю */
export const VARIANT_BANNER_LINE_HEIGHT = 1.2;

/** Кегль названия варианта: на шаг крупнее основного текста письма */
export const variantBannerSize = (lg: number): number => lg + 1;

/** Название варианта комплекта в шапке первого листа */
export const variantBannerStyles = themedStyles(({ colors, sizes, fonts }) =>
    StyleSheet.create({
        title: {
            fontFamily: fonts.heading,
            fontSize: variantBannerSize(sizes.lg),
            fontWeight: fonts.headingWeight ?? 'bold',
            lineHeight: VARIANT_BANNER_LINE_HEIGHT,
            color: colors.accent,
            marginBottom: VARIANT_BANNER_GAP,
        },
    }),
);
