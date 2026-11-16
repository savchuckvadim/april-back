import { StyleSheet } from '@react-pdf/renderer';
import { A4 } from '../../kit/theme/offer-pdf-theme';
import { themedStyles } from '../../kit/theme/themed-styles';

/** Поля титульника */
const MARGIN = 52;
/** Колонка текста: правее — грани */
const TEXT_WIDTH = 360;

export const facetCoverStyles = themedStyles(({ colors, sizes, fonts }) => {
    const text = colors.coverText ?? '#FFFFFF';
    return StyleSheet.create({
        paper: {
            position: 'absolute',
            top: 0,
            left: 0,
            width: A4.width,
            height: A4.height,
            backgroundColor: colors.coverPaper ?? colors.accent,
        },
        shapes: { position: 'absolute', top: 0, left: 0 },
        top: {
            position: 'absolute',
            top: MARGIN,
            left: MARGIN,
            width: TEXT_WIDTH,
        },
        company: {
            marginTop: 10,
            fontSize: sizes.sm,
            color: text,
            opacity: 0.85,
        },
        main: {
            position: 'absolute',
            top: 250,
            left: MARGIN,
            width: TEXT_WIDTH,
        },
        kicker: {
            fontSize: sizes.xs,
            letterSpacing: 1.6,
            textTransform: 'uppercase',
            color: colors.accentSoft ?? text,
            marginBottom: 14,
        },
        product: {
            fontFamily: fonts.heading,
            fontSize: sizes.h1,
            fontWeight: 'bold',
            lineHeight: 1.12,
            color: text,
        },
        bar: {
            width: 56,
            height: 4,
            backgroundColor: colors.accent,
            marginTop: 18,
        },
        supply: {
            marginTop: 14,
            fontSize: sizes.lg + 1,
            lineHeight: 1.35,
            color: text,
            opacity: 0.85,
        },
        // правее нижних граней: они доходят до 280 pt по низу листа
        bottom: {
            position: 'absolute',
            left: 300,
            right: MARGIN,
            bottom: MARGIN + 6,
        },
        person: { marginTop: 14 },
        label: {
            fontSize: sizes.xs,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: colors.accentSoft ?? text,
            marginBottom: 3,
        },
        value: {
            fontFamily: fonts.heading,
            fontSize: sizes.lg + 1,
            fontWeight: 'bold',
            color: text,
        },
        detail: { marginTop: 2, fontSize: sizes.sm, color: text, opacity: 0.8 },
    });
});
