import { StyleSheet } from '@react-pdf/renderer';
import { A4 } from '../../kit/theme/offer-pdf-theme';
import { themedStyles } from '../../kit/theme/themed-styles';

/** Поля титульника */
export const MONO_COVER_MARGIN = 48;
/** Верх главного блока: комплект крупно */
const MAIN_TOP = 168;
/** Колонка текста: справа остаётся место под вкладку */
const MAIN_WIDTH = A4.width - MONO_COVER_MARGIN * 2 - 24;
/** Кегль названия комплекта: длинное в три строки ещё помещается */
const PRODUCT_SIZE = 38;

export const monoCoverStyles = themedStyles(({ colors, sizes, fonts }) =>
    StyleSheet.create({
        top: {
            position: 'absolute',
            top: MONO_COVER_MARGIN,
            left: MONO_COVER_MARGIN,
            right: MONO_COVER_MARGIN,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        chips: { flexDirection: 'row', alignItems: 'center' },
        gap: { width: 4 },
        date: {
            fontSize: sizes.xs,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: colors.muted,
        },
        main: {
            position: 'absolute',
            top: MAIN_TOP,
            left: MONO_COVER_MARGIN,
            width: MAIN_WIDTH,
        },
        kicker: {
            fontSize: sizes.xs,
            letterSpacing: 1.6,
            textTransform: 'uppercase',
            color: colors.muted,
            marginBottom: 14,
        },
        product: {
            fontFamily: fonts.heading,
            fontSize: PRODUCT_SIZE,
            fontWeight: 300,
            lineHeight: 1.08,
            letterSpacing: -1,
            color: colors.text,
        },
        supply: {
            marginTop: 14,
            fontSize: sizes.lg + 2,
            lineHeight: 1.35,
            color: colors.muted,
        },
        recipient: { marginTop: 56, width: '70%' },
        rule: { height: 0.75, backgroundColor: colors.text },
        bottom: {
            position: 'absolute',
            left: MONO_COVER_MARGIN,
            right: MONO_COVER_MARGIN,
            bottom: MONO_COVER_MARGIN + 8,
        },
        bottomRow: { marginTop: 12 },
        label: {
            fontSize: sizes.xs,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: colors.muted,
            marginBottom: 4,
        },
        value: { fontSize: sizes.lg, fontWeight: 600, color: colors.text },
        valueLarge: {
            fontFamily: fonts.heading,
            fontSize: 18,
            fontWeight: 600,
            lineHeight: 1.2,
            color: colors.text,
        },
        detail: { fontSize: sizes.sm, color: colors.muted, marginTop: 2 },
    }),
);
