import type { FC } from 'react';
import { Image, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { themedStyles } from '../../kit/theme/themed-styles';

const headerStyles = themedStyles(({ colors, sizes, page, lineHeight }) =>
    StyleSheet.create({
        header: {
            fontSize: sizes.base,
            lineHeight,
            position: 'absolute',
            top: page.edge,
            left: page.paddingHorizontal,
            right: page.paddingHorizontal,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingBottom: 8,
            borderBottomWidth: 0.5,
            borderBottomColor: colors.line,
        },
        brand: { flexDirection: 'row', alignItems: 'center', maxWidth: '60%' },
        mark: {
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.accent,
            marginRight: 6,
        },
        logo: {
            height: 18,
            maxWidth: 100,
            objectFit: 'contain',
            marginRight: 6,
        },
        company: { fontSize: sizes.sm, fontWeight: 'bold', color: colors.text },
        doc: { fontSize: sizes.xs, color: colors.muted, textAlign: 'right' },
    }),
);

/** Шапка страниц «Призмы»: бренд слева, «КП · дата» справа, тонкая линия. */
export const PrismHeader: FC<OfferPdfChromeProps> = ({ model, theme }) => {
    const styles = headerStyles(theme);
    const company = model.data.MyCompanyName || model.data.MyCompanyFullName;

    return (
        <View fixed style={styles.header}>
            <View style={styles.brand}>
                {model.images.logo ? (
                    <Image style={styles.logo} src={model.images.logo} />
                ) : (
                    <View style={styles.mark} />
                )}
                {company ? <Text style={styles.company}>{company}</Text> : null}
            </View>
            <Text style={styles.doc}>
                Коммерческое предложение · {model.meta.date}
            </Text>
        </View>
    );
};
