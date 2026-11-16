import { StyleSheet } from '@react-pdf/renderer';
import type { BrandCoverStyles } from '../../kit/cover/BrandCover';
import type { OfferPdfTheme } from '../../kit/theme/offer-pdf-theme';
import { themedStyles } from '../../kit/theme/themed-styles';

/** Поля титульника */
const MARGIN = 54;

const styles = themedStyles(({ colors, sizes, fonts }) =>
    StyleSheet.create({
        top: { position: 'absolute', top: MARGIN, left: MARGIN, width: 320 },
        company: { marginTop: 10, fontSize: sizes.sm, color: colors.text },
        // выше колец: они занимают середину листа с 35 % высоты
        main: { position: 'absolute', top: 130, left: MARGIN, width: 420 },
        kicker: {
            fontSize: sizes.xs,
            letterSpacing: 1.6,
            textTransform: 'uppercase',
            color: colors.accent,
            marginBottom: 12,
        },
        product: {
            fontFamily: fonts.heading,
            fontSize: sizes.h1,
            fontWeight: 'bold',
            lineHeight: 1.12,
            color: colors.accentStrong ?? colors.text,
        },
        supply: {
            marginTop: 12,
            fontSize: sizes.lg + 1,
            lineHeight: 1.35,
            color: colors.text,
        },
        // ниже колец и выше коралловой черты у низа листа
        bottom: {
            position: 'absolute',
            left: MARGIN,
            right: MARGIN,
            bottom: 86,
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
        value: {
            fontFamily: fonts.heading,
            fontSize: sizes.lg,
            fontWeight: 'bold',
            color: colors.text,
        },
        detail: { marginTop: 2, fontSize: sizes.sm, color: colors.muted },
    }),
);

/** Расстановка титульника «Ореола» */
export const haloCoverStyles = (theme: OfferPdfTheme): BrandCoverStyles => {
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
