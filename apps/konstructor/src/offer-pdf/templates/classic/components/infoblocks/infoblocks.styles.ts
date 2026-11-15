import { StyleSheet } from '@react-pdf/renderer';
import { CLASSIC_THEME } from '../../classic.theme';
import { FRAME, GRID, NAME_COL } from './infoblocks.layout';

const { colors, sizes } = CLASSIC_THEME;

/**
 * Рамка таблицы — на строках, как в таблице цен: обёртка при разрыве
 * тянется до низа листа, и её рамка рисовала пустую клетку под последней
 * строкой. Соседние строки делят линию (marginTop: -GRID), поэтому таблица
 * закрыта и на разрыве между строками.
 */
const rowFrame = {
    marginTop: -GRID,
    borderLeftWidth: FRAME,
    borderRightWidth: FRAME,
    borderTopWidth: GRID,
    borderBottomWidth: GRID,
    borderColor: colors.tableBorder,
} as const;

const cellPadding = { paddingVertical: 3, paddingHorizontal: 4 } as const;

export const infoblocksStyles = StyleSheet.create({
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
    itemDesc: { fontSize: sizes.sm, color: colors.muted, textAlign: 'justify' },
    table: { marginTop: 6 },
    tr: { flexDirection: 'row', ...rowFrame },
    /** Длинная строка: название вынесено абсолютом, описание — колонкой справа */
    trLong: { paddingLeft: NAME_COL, ...rowFrame },
    trGroup: { backgroundColor: colors.shade },
    td: {
        ...cellPadding,
        borderRightWidth: GRID,
        borderRightColor: colors.tableBorder,
    },
    tdLast: { borderRightWidth: 0 },
    tdHalf: { width: '50%' },
    tdName: { width: NAME_COL },
    tdFill: { flexGrow: 1, flexBasis: 0 },
    tdNameAbsolute: {
        ...cellPadding,
        position: 'absolute',
        top: 0,
        left: 0,
        width: NAME_COL,
    },
    tdDescLong: {
        ...cellPadding,
        marginLeft: -GRID,
        borderLeftWidth: GRID,
        borderLeftColor: colors.tableBorder,
    },
    tdText: { fontSize: sizes.sm },
    tdDescText: { fontSize: sizes.sm, color: colors.muted },
    groupCell: { fontSize: sizes.sm, fontWeight: 'bold', color: colors.accent },
});
