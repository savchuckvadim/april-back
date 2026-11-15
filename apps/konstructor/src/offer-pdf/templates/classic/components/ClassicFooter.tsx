import type { FC } from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { managerOf } from '../../kit/lib/manager.util';
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
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            borderTopWidth: 0.5,
            borderTopColor: colors.line,
            paddingTop: 6,
        },
        managerLine: { fontSize: sizes.xs, color: colors.muted },
        managerName: {
            fontSize: sizes.sm,
            fontWeight: 'bold',
            color: colors.text,
        },
    }),
);

/** Подвал на каждой странице: контакты менеджера (по настройке) и номер страницы. */
export const ClassicFooter: FC<OfferPdfChromeProps> = ({ model, theme }) => {
    const styles = footerStyles(theme);
    const manager = managerOf(model);

    return (
        <View fixed style={styles.footer}>
            <View>
                {manager ? (
                    <>
                        <Text style={styles.managerLine}>
                            {manager.position}
                        </Text>
                        <Text style={styles.managerName}>{manager.name}</Text>
                        {manager.email ? (
                            <Text style={styles.managerLine}>
                                e-mail: {manager.email}
                            </Text>
                        ) : null}
                        {manager.phone ? (
                            <Text style={styles.managerLine}>
                                телефон: {manager.phone}
                            </Text>
                        ) : null}
                    </>
                ) : null}
            </View>
        </View>
    );
};
