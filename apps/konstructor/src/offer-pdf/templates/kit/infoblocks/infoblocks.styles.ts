import { StyleSheet } from '@react-pdf/renderer';
import { themedStyles } from '../theme/themed-styles';
import {
    ALTERNATIVE_BLOCK_MARGIN_BOTTOM,
    ALTERNATIVE_BLOCK_MARGIN_TOP,
    ALTERNATIVE_SET_MARGIN_BOTTOM,
    ALTERNATIVE_SET_MARGIN_TOP,
    ALTERNATIVE_SET_PADDING_HORIZONTAL,
    ALTERNATIVE_SET_PADDING_VERTICAL,
    COMPLECT_HEAD_BAR,
    COMPLECT_HEAD_MARGIN_BOTTOM,
    COMPLECT_HEAD_MARGIN_TOP,
    COMPLECT_HEAD_MARGIN_TOP_UNDER_SET,
    COMPLECT_HEAD_PADDING,
    COMPLECT_TITLE_LINE_HEIGHT,
    complectTitleSize,
    FRAME,
    GRID,
    nameColumnWidth,
} from './infoblocks.layout';

const cellPadding = { paddingVertical: 3, paddingHorizontal: 4 } as const;

export const infoblocksStyles = themedStyles(theme => {
    const { colors, sizes, lineHeight } = theme;
    const nameCol = nameColumnWidth(theme);
    // название комплекта крупнее строки обёртки — тогда задаёт свой интерлиньяж
    const titleSize = complectTitleSize(sizes.lg);
    const titleLine =
        titleSize > sizes.base * lineHeight
            ? { lineHeight: COMPLECT_TITLE_LINE_HEIGHT }
            : {};
    /**
     * Рамка таблицы — на строках, как в таблице цен: обёртка при разрыве
     * тянется до низа листа, и её рамка рисовала пустую клетку под последней
     * строкой. Соседние строки делят линию (marginTop: -GRID), поэтому
     * таблица закрыта и на разрыве между строками.
     */
    const rowFrame = {
        marginTop: -GRID,
        borderLeftWidth: FRAME,
        borderRightWidth: FRAME,
        borderTopWidth: GRID,
        borderBottomWidth: GRID,
        borderColor: colors.tableBorder,
    } as const;

    return StyleSheet.create({
        complectName: {
            fontSize: sizes.lg,
            fontWeight: 'bold',
            color: colors.accent,
            marginBottom: 4,
        },
        /** Заголовок комплекта в разделе по комплектам: полоса акцента слева */
        complectHead: {
            marginTop: COMPLECT_HEAD_MARGIN_TOP,
            marginBottom: COMPLECT_HEAD_MARGIN_BOTTOM,
            paddingLeft: COMPLECT_HEAD_PADDING,
            borderLeftWidth: COMPLECT_HEAD_BAR,
            borderLeftColor: colors.accent,
        },
        /** Под плашкой набора для сравнения отступ сверху меньше */
        complectHeadUnderSet: {
            marginTop: COMPLECT_HEAD_MARGIN_TOP_UNDER_SET,
        },
        /** Заголовок блока наполнения наборов для сравнения: поверх стиля заголовка раздела */
        alternativeBlockTitle: {
            marginTop: ALTERNATIVE_BLOCK_MARGIN_TOP,
            marginBottom: ALTERNATIVE_BLOCK_MARGIN_BOTTOM,
        },
        /** Плашка набора для сравнения: заливка шапки таблицы цен, как у заголовков наборов там */
        alternativeSetHead: {
            marginTop: ALTERNATIVE_SET_MARGIN_TOP,
            marginBottom: ALTERNATIVE_SET_MARGIN_BOTTOM,
            paddingVertical: ALTERNATIVE_SET_PADDING_VERTICAL,
            paddingHorizontal: ALTERNATIVE_SET_PADDING_HORIZONTAL,
            backgroundColor: colors.shade,
        },
        alternativeSetTitle: {
            fontSize: titleSize,
            fontWeight: 'bold',
            color: colors.accent,
            ...titleLine,
        },
        complectTitle: {
            fontSize: titleSize,
            fontWeight: 'bold',
            color: colors.accent,
            ...titleLine,
        },
        /** Подпись поставки под названием комплекта */
        complectSupply: {
            fontSize: sizes.base,
            fontWeight: 'normal',
            color: colors.muted,
        },
        groupTitle: {
            fontSize: sizes.lg,
            fontWeight: 'bold',
            color: colors.accent,
            marginTop: 10,
            marginBottom: 4,
        },
        item: { marginBottom: 3 },
        itemName: { fontSize: sizes.base },
        /** Список без описаний в две колонки: строка из пары названий */
        namesRow: { flexDirection: 'row', marginBottom: 3 },
        namesCell: { width: '50%', paddingRight: 12 },
        itemDesc: {
            fontSize: sizes.sm,
            color: colors.muted,
            textAlign: 'justify',
        },
        table: { marginTop: 6 },
        tr: { flexDirection: 'row', ...rowFrame },
        /** Длинная строка: название вынесено абсолютом, описание — колонкой справа */
        trLong: { paddingLeft: nameCol, ...rowFrame },
        trGroup: { backgroundColor: colors.shade },
        td: {
            ...cellPadding,
            borderRightWidth: GRID,
            borderRightColor: colors.tableBorder,
        },
        tdLast: { borderRightWidth: 0 },
        tdHalf: { width: '50%' },
        tdName: { width: nameCol },
        tdFill: { flexGrow: 1, flexBasis: 0 },
        tdNameAbsolute: {
            ...cellPadding,
            position: 'absolute',
            top: 0,
            left: 0,
            width: nameCol,
        },
        tdDescLong: {
            ...cellPadding,
            marginLeft: -GRID,
            borderLeftWidth: GRID,
            borderLeftColor: colors.tableBorder,
        },
        tdText: { fontSize: sizes.sm },
        tdDescText: { fontSize: sizes.sm, color: colors.muted },
        groupCell: {
            fontSize: sizes.sm,
            fontWeight: 'bold',
            color: colors.accent,
        },
    });
});
