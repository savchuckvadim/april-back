import type { FC } from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { managerOf } from '../../kit/lib/manager.util';
import { joinNonEmpty } from '../../kit/lib/text.util';
import { themedStyles } from '../../kit/theme/themed-styles';

const footerStyles = themedStyles(({ colors, sizes, page, lineHeight }) =>
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
            borderTopWidth: 0.75,
            borderTopColor: colors.accentSoft ?? colors.line,
        },
        manager: { fontSize: sizes.xs, color: colors.muted, maxWidth: '82%' },
        name: { fontWeight: 'bold', color: colors.accent },
    }),
);

/** Подвал «Лаванды»: светлая черта и менеджер; номер страницы — справа (kit) */
export const LavenderFooter: FC<OfferPdfChromeProps> = ({ model, theme }) => {
    const styles = footerStyles(theme);
    const manager = managerOf(model);
    const contacts = manager
        ? joinNonEmpty([manager.phone, manager.email], ' · ')
        : '';

    return (
        <View fixed style={styles.footer}>
            {manager ? (
                <Text style={styles.manager}>
                    <Text style={styles.name}>{manager.name}</Text>
                    {contacts ? ` · ${contacts}` : ''}
                </Text>
            ) : null}
        </View>
    );
};
