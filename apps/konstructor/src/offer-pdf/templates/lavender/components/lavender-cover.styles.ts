import { StyleSheet } from '@react-pdf/renderer';
import type { CoverPersonStyles } from '../../kit/cover/CoverPerson';
import type { OfferPdfTheme } from '../../kit/theme/offer-pdf-theme';
import { themedStyles } from '../../kit/theme/themed-styles';

/** Поля титульника */
const MARGIN = 54;

export const lavenderCoverStyles = themedStyles(({ colors, sizes, fonts }) =>
    StyleSheet.create({
        gradient: { position: 'absolute', top: 0, left: 0 },
        top: {
            position: 'absolute',
            top: MARGIN,
            left: MARGIN,
            right: MARGIN,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        company: { fontSize: sizes.sm, color: colors.text, textAlign: 'right' },
        main: { position: 'absolute', top: 260, left: MARGIN, width: 400 },
        kicker: {
            fontSize: sizes.xs,
            letterSpacing: 1.6,
            textTransform: 'uppercase',
            color: colors.accent,
            marginBottom: 14,
        },
        product: {
            fontFamily: fonts.heading,
            fontSize: sizes.h1,
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: -0.6,
            color: colors.accentStrong ?? colors.text,
        },
        supply: {
            marginTop: 16,
            fontSize: sizes.lg + 2,
            lineHeight: 1.35,
            color: colors.text,
        },
        bottom: {
            position: 'absolute',
            left: MARGIN,
            right: MARGIN,
            bottom: MARGIN,
            flexDirection: 'row',
            paddingTop: 14,
            borderTopWidth: 0.75,
            borderTopColor: colors.accent,
        },
        person: { width: '50%', paddingRight: 16 },
        label: {
            fontSize: sizes.xs,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: colors.accent,
            marginBottom: 3,
        },
        value: { fontSize: sizes.lg, fontWeight: 600, color: colors.text },
        detail: { marginTop: 2, fontSize: sizes.sm, color: colors.muted },
    }),
);

/** Стили блока «для кого / кто подготовил» */
export const lavenderPersonStyles = (
    theme: OfferPdfTheme,
): CoverPersonStyles => {
    const styles = lavenderCoverStyles(theme);
    return {
        block: styles.person,
        label: styles.label,
        value: styles.value,
        detail: styles.detail,
    };
};
