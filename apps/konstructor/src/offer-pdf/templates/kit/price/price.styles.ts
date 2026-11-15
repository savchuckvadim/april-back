import { StyleSheet } from '@react-pdf/renderer';
import { themedStyles } from '../theme/themed-styles';
import { FRAME, GRID } from './price.layout';

/**
 * Рамка таблицы нарисована на строках, а не на обёртке: так итог живёт в
 * одном потоке со строками, и при разрыве страницы последняя строка
 * уходит вместе с ним (minPresenceAhead), а не «Итого» одно на новом листе.
 */
export const priceStyles = themedStyles(({ colors, sizes }) =>
    StyleSheet.create({
        table: { marginTop: 6 },
        row: {
            flexDirection: 'row',
            borderLeftWidth: FRAME,
            borderRightWidth: FRAME,
            borderColor: colors.tableBorder,
        },
        rowHead: {
            backgroundColor: colors.shade,
            borderTopWidth: FRAME,
            borderTopColor: colors.tableBorder,
        },
        rowLast: {
            borderBottomWidth: FRAME - GRID,
            borderBottomColor: colors.tableBorder,
        },
        cell: {
            paddingVertical: 4,
            paddingHorizontal: 4,
            borderRightWidth: GRID,
            borderRightColor: colors.tableBorder,
            borderBottomWidth: GRID,
            borderBottomColor: colors.tableBorder,
            justifyContent: 'center',
        },
        cellLast: { borderRightWidth: 0 },
        cellHead: {
            fontSize: sizes.sm,
            fontWeight: 'bold',
            textAlign: 'center',
        },
        cellText: { fontSize: sizes.sm, textAlign: 'center' },
        cellTextLeft: { fontSize: sizes.sm, textAlign: 'left' },
        sub: { fontSize: sizes.xs, color: colors.muted, marginTop: 1 },
        totals: { marginTop: 8, alignItems: 'flex-end' },
        totalLine: { fontSize: sizes.lg },
        totalSub: {
            fontSize: sizes.sm,
            color: colors.muted,
            textAlign: 'right',
        },
        salePhrase: {
            marginTop: 8,
            fontSize: sizes.base,
            fontStyle: 'italic',
            color: colors.accent,
        },
    }),
);
