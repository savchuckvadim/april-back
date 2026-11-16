import { StyleSheet } from '@react-pdf/renderer';
import { themedStyles } from '../theme/themed-styles';

/** Ряд шапки: логотипы и компания слева, дата справа */
export const brandHeaderStyles = themedStyles(
    ({ colors, sizes, page, lineHeight }) =>
        StyleSheet.create({
            row: {
                fontSize: sizes.base,
                lineHeight,
                position: 'absolute',
                top: page.edge,
                left: page.paddingHorizontal,
                right: page.paddingHorizontal,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
            },
            brand: {
                flexDirection: 'row',
                alignItems: 'center',
                maxWidth: '70%',
            },
            logoGap: { width: 8 },
            company: { marginLeft: 10, fontSize: sizes.sm, color: colors.text },
            date: {
                fontSize: sizes.xs,
                color: colors.muted,
                textAlign: 'right',
            },
        }),
);
