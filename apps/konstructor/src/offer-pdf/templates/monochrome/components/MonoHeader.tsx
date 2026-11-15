import type { FC } from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import type { OfferPdfChromeProps } from '../../kit/document/offer-pdf-chrome';
import { offerCoverContent } from '../../kit/lib/cover.util';
import { themedStyles } from '../../kit/theme/themed-styles';
import { MonoArrow } from './MonoArrow';
import { MonoPill } from './MonoPill';

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
        },
        chips: { flexDirection: 'row', alignItems: 'center' },
        gap: { width: 4 },
        company: {
            maxWidth: '55%',
            fontSize: sizes.xs,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: colors.muted,
            textAlign: 'right',
        },
    }),
);

/** Шапка страниц «Монохрома»: дата в таблетке со стрелкой слева, компания капсом справа. */
export const MonoHeader: FC<OfferPdfChromeProps> = ({ model, theme }) => {
    const styles = headerStyles(theme);
    const { company, date } = offerCoverContent(model);

    return (
        <View fixed style={styles.header}>
            <View style={styles.chips}>
                <MonoPill label={date} theme={theme} />
                <View style={styles.gap} />
                <MonoArrow color={theme.colors.text} />
            </View>
            {company ? <Text style={styles.company}>{company}</Text> : null}
        </View>
    );
};
