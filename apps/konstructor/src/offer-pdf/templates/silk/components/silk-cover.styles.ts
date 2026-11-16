import { StyleSheet } from '@react-pdf/renderer';
import type { BrandCoverStyles } from '../../kit/cover/BrandCover';
import type { OfferPdfTheme } from '../../kit/theme/offer-pdf-theme';
import { themedStyles } from '../../kit/theme/themed-styles';

/** Поля титульника */
const MARGIN = 54;

/**
 * Волны идут из правого верхнего угла и по диагонали слева-посередине
 * вправо-вниз: свободны левый верх, правая середина и левый низ.
 */
const styles = themedStyles(({ colors, sizes, fonts }) =>
    StyleSheet.create({
        top: { position: 'absolute', top: MARGIN, left: MARGIN, width: 260 },
        company: { marginTop: 10, fontSize: sizes.sm, color: colors.text },
        // правее левой волны, шире — длинное первое слово комплекта не переносится
        main: { position: 'absolute', top: 290, left: 236, width: 306 },
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
            fontWeight: 400,
            lineHeight: 1.12,
            color: colors.accentStrong ?? colors.text,
        },
        supply: {
            marginTop: 12,
            fontSize: sizes.lg,
            lineHeight: 1.35,
            color: colors.text,
        },
        bottom: {
            position: 'absolute',
            left: MARGIN,
            bottom: MARGIN,
            width: 250,
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
            color: colors.text,
        },
        detail: { marginTop: 2, fontSize: sizes.sm, color: colors.muted },
    }),
);

/** Расстановка титульника «Шёлка» */
export const silkCoverStyles = (theme: OfferPdfTheme): BrandCoverStyles => {
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
