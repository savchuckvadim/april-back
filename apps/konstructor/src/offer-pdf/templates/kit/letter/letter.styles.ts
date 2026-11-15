import { StyleSheet } from '@react-pdf/renderer';
import { themedStyles } from '../theme/themed-styles';

export const letterStyles = themedStyles(({ colors, sizes }) =>
    StyleSheet.create({
        rqRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginBottom: 16,
        },
        rqLeft: { width: '40%' },
        rqRight: { width: '50%', alignItems: 'flex-end' },
        rqLine: { fontSize: sizes.sm, color: colors.muted },
        rqLineRight: {
            fontSize: sizes.sm,
            color: colors.muted,
            textAlign: 'right',
        },
        appeal: {
            fontSize: sizes.lg,
            fontWeight: 'bold',
            textAlign: 'center',
            marginBottom: 8,
        },
        // Без переносов выключка по ширине даёт дыры между словами — левый край.
        text: { fontSize: sizes.lg, textAlign: 'left' },
    }),
);
