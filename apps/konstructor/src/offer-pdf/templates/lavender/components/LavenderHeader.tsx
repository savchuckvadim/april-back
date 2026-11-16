import type { FC } from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import { BrandLogo } from '../../kit/brand/BrandLogo';
import { SoftGradient } from '../../kit/decor/SoftGradient';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { A4 } from '../../kit/theme/offer-pdf-theme';
import { themedStyles } from '../../kit/theme/themed-styles';

/** Высота полосы градиента под шапкой */
const BAND = 70;

const headerStyles = themedStyles(({ colors, sizes, page, lineHeight }) =>
    StyleSheet.create({
        band: {
            fontSize: sizes.base,
            lineHeight,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: BAND,
        },
        gradient: { position: 'absolute', top: 0, left: 0 },
        row: {
            position: 'absolute',
            top: 22,
            left: page.paddingHorizontal,
            right: page.paddingHorizontal,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        brand: { flexDirection: 'row', alignItems: 'center', maxWidth: '68%' },
        company: { marginLeft: 10, fontSize: sizes.sm, color: colors.text },
        doc: { fontSize: sizes.xs, color: colors.muted, textAlign: 'right' },
    }),
);

/** Шапка «Лаванды»: полоса градиента, уходящая в белый лист; логотип и компания слева */
export const LavenderHeader: FC<OfferPdfChromeProps> = ({ model, theme }) => {
    const styles = headerStyles(theme);
    const company = model.data.MyCompanyName || model.data.MyCompanyFullName;
    const gradient = theme.colors.gradient;

    return (
        <View fixed style={styles.band}>
            {gradient ? (
                <View style={styles.gradient}>
                    <SoftGradient
                        id="lavender-band"
                        width={A4.width}
                        height={BAND}
                        colors={gradient}
                        direction="fade-down"
                    />
                </View>
            ) : null}
            <View style={styles.row}>
                <View style={styles.brand}>
                    <BrandLogo
                        logo={model.assets?.logos.garant}
                        color={theme.colors.accentStrong ?? theme.colors.accent}
                        height={18}
                    />
                    {company ? (
                        <Text style={styles.company}>{company}</Text>
                    ) : null}
                </View>
                <Text style={styles.doc}>{model.meta.date}</Text>
            </View>
        </View>
    );
};
