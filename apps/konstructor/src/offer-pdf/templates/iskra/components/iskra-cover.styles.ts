import { StyleSheet } from '@react-pdf/renderer';
import type { CoverPersonStyles } from '../../kit/cover/CoverPerson';
import type { OfferPdfTheme } from '../../kit/theme/offer-pdf-theme';
import { themedStyles } from '../../kit/theme/themed-styles';

/** Поля титульника */
const MARGIN = 54;
/** Узел: справа снизу, заходит за край листа */
const KNOT_WIDTH = 420;
const KNOT_HEIGHT = Math.round((KNOT_WIDTH * 1849) / 1484);

export const iskraCoverStyles = themedStyles(({ colors, sizes, fonts }) =>
    StyleSheet.create({
        knot: {
            position: 'absolute',
            right: -70,
            bottom: -60,
            width: KNOT_WIDTH,
            height: KNOT_HEIGHT,
        },
        logos: {
            position: 'absolute',
            top: MARGIN,
            left: MARGIN,
            flexDirection: 'row',
            alignItems: 'center',
        },
        logoGap: { width: 14 },
        company: {
            position: 'absolute',
            top: MARGIN + 40,
            left: MARGIN,
            width: 320,
            fontSize: sizes.sm,
            color: colors.text,
        },
        // левее и выше узла
        main: { position: 'absolute', top: 180, left: MARGIN, width: 330 },
        kicker: {
            fontSize: sizes.xs,
            letterSpacing: 1.6,
            textTransform: 'uppercase',
            color: colors.accent,
            marginBottom: 12,
        },
        title: {
            fontFamily: fonts.heading,
            fontSize: 26,
            fontWeight: 'bold',
            lineHeight: 1.12,
            color: colors.accentStrong ?? colors.text,
        },
        product: {
            marginTop: 18,
            fontFamily: fonts.heading,
            fontSize: sizes.lg + 1,
            fontWeight: 'bold',
            color: colors.text,
        },
        supply: { marginTop: 4, fontSize: sizes.base, color: colors.muted },
        bottom: {
            position: 'absolute',
            left: MARGIN,
            bottom: MARGIN,
            width: 190,
        },
        person: { marginTop: 12 },
        label: {
            fontSize: sizes.xs,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: colors.accent,
            marginBottom: 3,
        },
        value: {
            fontFamily: fonts.heading,
            fontSize: sizes.lg,
            fontWeight: 'bold',
            color: colors.text,
        },
        detail: { marginTop: 2, fontSize: sizes.sm, color: colors.muted },
    }),
);

/** Стили блока «для кого / кто подготовил» */
export const iskraPersonStyles = (theme: OfferPdfTheme): CoverPersonStyles => {
    const styles = iskraCoverStyles(theme);
    return {
        block: styles.person,
        label: styles.label,
        value: styles.value,
        detail: styles.detail,
    };
};
