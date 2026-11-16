import {
    brandCoverStyles,
    COVER_MARGIN,
} from '../../kit/cover/brand-cover.styles';

/** Узел: справа снизу, заходит за край листа */
const KNOT_WIDTH = 420;
const KNOT_HEIGHT = Math.round((KNOT_WIDTH * 1849) / 1484);

/**
 * Расстановка титульника «Искры»: два логотипа в ряд и компания строкой
 * под ними; крупно — сервис, комплект и поставка — строками под ним.
 */
export const iskraCoverStyles = brandCoverStyles(
    (base, { colors, sizes, fonts }) => ({
        knot: {
            position: 'absolute',
            right: -70,
            bottom: -60,
            width: KNOT_WIDTH,
            height: KNOT_HEIGHT,
        },
        logos: {
            position: 'absolute',
            top: COVER_MARGIN,
            left: COVER_MARGIN,
            flexDirection: 'row',
            alignItems: 'center',
        },
        logoGap: { width: 14 },
        company: {
            position: 'absolute',
            top: COVER_MARGIN + 40,
            left: COVER_MARGIN,
            width: 320,
            fontSize: sizes.sm,
            color: colors.text,
        },
        // левее и выше узла
        main: { ...base.main, top: 180, width: 330 },
        title: { ...base.product, fontSize: 26 },
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
            left: COVER_MARGIN,
            bottom: COVER_MARGIN,
            width: 190,
        },
        person: { marginTop: 12 },
    }),
);
