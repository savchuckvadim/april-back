import { StyleSheet } from '@react-pdf/renderer';
import { themedStyles } from '../theme/themed-styles';

export const managerFooterStyles = themedStyles(
    ({ colors, sizes, page, lineHeight }) =>
        StyleSheet.create({
            footer: {
                fontSize: sizes.base,
                lineHeight,
                position: 'absolute',
                bottom: page.edge,
                left: page.paddingHorizontal,
                right: page.paddingHorizontal,
                minHeight: Math.ceil(sizes.xs * 1.5),
                paddingTop: 7,
            },
            line: {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 1,
                backgroundColor: colors.accent,
            },
            manager: {
                fontSize: sizes.xs,
                color: colors.muted,
                maxWidth: '82%',
            },
            name: { fontWeight: 'bold', color: colors.text },
        }),
);
