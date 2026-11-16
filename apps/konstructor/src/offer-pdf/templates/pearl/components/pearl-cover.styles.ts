import { StyleSheet } from '@react-pdf/renderer';
import type { BrandCoverStyles } from '../../kit/cover/BrandCover';
import type { OfferPdfTheme } from '../../kit/theme/offer-pdf-theme';
import { themedStyles } from '../../kit/theme/themed-styles';

/** Поля титульника */
const MARGIN = 54;

const styles = themedStyles(({ colors, sizes, fonts }) =>
    StyleSheet.create({
        top: { position: 'absolute', top: MARGIN, left: MARGIN, width: 300 },
        company: { marginTop: 10, fontSize: sizes.sm, color: colors.text },
        // левее стекла справа: оно занимает верхнюю половину листа от 60 % ширины
        main: { position: 'absolute', top: 300, left: MARGIN, width: 310 },
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
            letterSpacing: -0.5,
            color: colors.accentStrong ?? colors.text,
        },
        supply: {
            marginTop: 14,
            fontSize: sizes.lg + 1,
            lineHeight: 1.35,
            color: colors.text,
        },
        // правее стекла в левом нижнем углу
        bottom: {
            position: 'absolute',
            left: 170,
            right: MARGIN,
            bottom: MARGIN,
            flexDirection: 'row',
        },
        person: { width: '50%', paddingRight: 14 },
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

/** Расстановка титульника «Перламутра» */
export const pearlCoverStyles = (theme: OfferPdfTheme): BrandCoverStyles => {
    const s = styles(theme);
    return {
        top: s.top,
        company: s.company,
        main: s.main,
        kicker: s.kicker,
        product: s.product,
        supply: s.supply,
        bottom: s.bottom,
        person: {
            block: s.person,
            label: s.label,
            value: s.value,
            detail: s.detail,
        },
    };
};
