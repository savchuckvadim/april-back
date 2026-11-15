import { StyleSheet } from '@react-pdf/renderer';
import { A4 } from '../../kit/theme/offer-pdf-theme';
import { themedStyles } from '../../kit/theme/themed-styles';

/** Поля титульника и ширина полос «стекла» справа */
export const COVER_MARGIN = 52;
export const COVER_STRIPES_WIDTH = Math.round(A4.width * 0.36);
const TEXT_WIDTH = A4.width - COVER_MARGIN - COVER_STRIPES_WIDTH;

export const modernCoverStyles = themedStyles(({ colors, sizes, fonts }) =>
    StyleSheet.create({
        stripes: { position: 'absolute', top: 0, right: 0 },
        top: {
            position: 'absolute',
            top: COVER_MARGIN + 4,
            left: COVER_MARGIN,
            width: TEXT_WIDTH,
        },
        brandRow: { flexDirection: 'row', alignItems: 'center' },
        brandMark: {
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: colors.accent,
            marginRight: 8,
        },
        logo: {
            height: 22,
            maxWidth: 120,
            objectFit: 'contain',
            marginRight: 8,
        },
        company: { fontSize: sizes.base, color: colors.text },
        title: {
            marginTop: 84,
            fontFamily: fonts.heading,
            fontSize: sizes.h1,
            fontWeight: 'bold',
            lineHeight: 1.04,
            letterSpacing: -0.4,
            color: colors.text,
        },
        bar: {
            width: 64,
            height: 6,
            borderRadius: 3,
            backgroundColor: colors.accent,
            marginTop: 18,
        },
        product: { marginTop: 22, fontSize: 15, color: colors.text },
        details: { marginTop: 4, fontSize: sizes.sm, color: colors.muted },
        bottom: {
            position: 'absolute',
            left: COVER_MARGIN,
            bottom: COVER_MARGIN + 4,
            width: TEXT_WIDTH,
        },
        block: { marginTop: 14 },
        label: {
            fontSize: sizes.sm,
            fontWeight: 'bold',
            color: colors.accent,
            marginBottom: 2,
        },
        value: { fontSize: sizes.lg, color: colors.text },
        contactRow: {
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 3,
        },
        dot: {
            width: 5,
            height: 5,
            borderRadius: 2.5,
            backgroundColor: colors.accent,
            marginRight: 6,
        },
        contact: { fontSize: sizes.sm, color: colors.muted },
    }),
);
