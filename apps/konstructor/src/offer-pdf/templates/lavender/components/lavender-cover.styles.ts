import {
    brandCoverStyles,
    COVER_MARGIN,
} from '../../kit/cover/brand-cover.styles';

/**
 * Расстановка титульника «Лаванды»: логотип и компания — по краям верхней
 * строки, люди внизу — за чертой.
 */
export const lavenderCoverStyles = brandCoverStyles(
    (base, { colors, sizes }) => ({
        gradient: { position: 'absolute', top: 0, left: 0 },
        top: {
            position: 'absolute',
            top: COVER_MARGIN,
            left: COVER_MARGIN,
            right: COVER_MARGIN,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        company: { fontSize: sizes.sm, color: colors.text, textAlign: 'right' },
        main: { ...base.main, top: 260, width: 400 },
        kicker: { ...base.kicker, marginBottom: 14 },
        product: {
            ...base.product,
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: -0.6,
        },
        supply: { ...base.supply, marginTop: 16, fontSize: sizes.lg + 2 },
        bottom: {
            ...base.bottom,
            paddingTop: 14,
            borderTopWidth: 0.75,
            borderTopColor: colors.accent,
        },
        person: { ...base.person, paddingRight: 16 },
        value: { fontSize: sizes.lg, fontWeight: 600, color: colors.text },
    }),
);
