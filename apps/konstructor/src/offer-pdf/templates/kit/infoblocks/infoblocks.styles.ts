import { StyleSheet } from '@react-pdf/renderer';
import { themedStyles } from '../theme/themed-styles';
import { FRAME, GRID, nameColumnWidth } from './infoblocks.layout';

const cellPadding = { paddingVertical: 3, paddingHorizontal: 4 } as const;

export const infoblocksStyles = themedStyles(theme => {
    const { colors, sizes } = theme;
    const nameCol = nameColumnWidth(theme);
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
