import { StyleSheet } from '@react-pdf/renderer';
import { themedStyles } from '../theme/themed-styles';

export const promoStyles = themedStyles(({ colors, sizes, fonts }) =>
    StyleSheet.create({
        title: {
            fontFamily: fonts.heading,
            fontSize: sizes.h2 + 6,
            fontWeight: fonts.headingWeight ?? 'bold',
            lineHeight: 1.15,
            color: colors.text,
            marginBottom: 14,
        },
        lead: { fontSize: sizes.lg, color: colors.text },
        item: { marginTop: 14, flexDirection: 'row' },
        mark: {
            width: 4,
            borderRadius: 2,
            backgroundColor: colors.accent,
            marginRight: 12,
        },
        itemBody: { flex: 1 },
        itemTitle: {
            fontSize: sizes.lg,
            fontWeight: 'bold',
            color: colors.text,
            marginBottom: 3,
        },
        itemText: { fontSize: sizes.base, color: colors.muted },
        note: { marginTop: 18, fontSize: sizes.base, color: colors.muted },
    }),
);
