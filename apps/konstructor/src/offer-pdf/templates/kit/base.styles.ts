import { StyleSheet } from '@react-pdf/renderer';
import { themedStyles } from './theme/themed-styles';

/** Общие стили блоков КП: страница, раздел, заголовок, подписи. */
export const baseStyles = themedStyles(
    ({ colors, sizes, page, fonts, lineHeight }) =>
        StyleSheet.create({
            page: {
                fontFamily: fonts.body,
                fontSize: sizes.base,
                color: colors.text,
                paddingTop: page.paddingTop,
                paddingBottom: page.paddingBottom,
                paddingHorizontal: page.paddingHorizontal,
            },
            /**
             * Интерлиньяж — на обёртке содержимого (шапка и подвал задают свой), не на
             * странице: у динамического текста (номер страницы) любой предок с
             * lineHeight гасит строку, и номер не печатался вовсе.
             */
            // безразмерный lineHeight react-pdf переводит в пункты по кеглю узла,
            // где он задан: без кегля здесь взялся бы кегль по умолчанию
            content: { fontSize: sizes.base, lineHeight },
            /** Титульник: без полей — стиль раскладывает лист сам */
            coverPage: {
                fontFamily: fonts.body,
                fontSize: sizes.base,
                color: colors.text,
                lineHeight,
            },
            section: { marginTop: 14 },
            h2: {
                fontFamily: fonts.heading,
                fontSize: sizes.h2,
                fontWeight: 'bold',
                color: colors.accent,
                marginBottom: 6,
            },
            caption: { fontSize: sizes.sm, color: colors.muted },
            muted: { color: colors.muted },
            bold: { fontWeight: 'bold' },
            accent: { color: colors.accent },
            small: { fontSize: sizes.sm },
        }),
);
