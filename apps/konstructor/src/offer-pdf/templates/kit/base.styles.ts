import { StyleSheet } from '@react-pdf/renderer';
import { themedStyles } from './theme/themed-styles';

/** Интерлиньяж крупного заголовка раздела — по его собственному кеглю */
const HEADING_LINE_HEIGHT = 1.15;

/** Общие стили блоков КП: страница, раздел, заголовок, подписи. */
export const baseStyles = themedStyles(
    ({ colors, sizes, page, fonts, lineHeight }) => {
        // цвет листа — только если стиль его задал: у белых стилей вывод прежний
        const paper = colors.paper ? { backgroundColor: colors.paper } : {};
        // заголовок наследует интерлиньяж обёртки уже в пунктах (по базовому
        // кеглю); крупный заголовок в такую строку не влезает и наезжает на
        // следующую — тогда задаёт свой. У мелких заголовков вывод прежний
        const headingLine =
            sizes.h2 > sizes.base * lineHeight
                ? { lineHeight: HEADING_LINE_HEIGHT }
                : {};
        return StyleSheet.create({
            page: {
                fontFamily: fonts.body,
                fontSize: sizes.base,
                color: colors.text,
                paddingTop: page.paddingTop,
                paddingBottom: page.paddingBottom,
                paddingHorizontal: page.paddingHorizontal,
                ...paper,
            },
            /**
             * Интерлиньяж — на обёртке содержимого (шапка и подвал задают
             * свой), не на странице: у динамического текста (номер страницы)
             * любой предок с lineHeight гасит строку, и номер не печатался
             * вовсе. Безразмерный lineHeight react-pdf переводит в пункты по
             * кеглю узла, где он задан: без кегля здесь взялся бы кегль по
             * умолчанию.
             */
            content: { fontSize: sizes.base, lineHeight },
            /** Титульник: без полей — стиль раскладывает лист сам */
            coverPage: {
                fontFamily: fonts.body,
                fontSize: sizes.base,
                color: colors.text,
                lineHeight,
                ...paper,
            },
            section: { marginTop: 14 },
            h2: {
                fontFamily: fonts.heading,
                fontSize: sizes.h2,
                fontWeight: fonts.headingWeight ?? 'bold',
                color: colors.accent,
                marginBottom: 6,
                ...headingLine,
            },
            caption: { fontSize: sizes.sm, color: colors.muted },
            muted: { color: colors.muted },
            bold: { fontWeight: 'bold' },
            accent: { color: colors.accent },
            small: { fontSize: sizes.sm },
        });
    },
);
