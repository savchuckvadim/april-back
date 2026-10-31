import { StyleSheet } from '@react-pdf/renderer';
import { OFFER_PDF_FONT_FAMILY } from '../../fonts/offer-pdf-fonts';
import { CLASSIC_THEME } from './classic.theme';

const { colors, sizes, page } = CLASSIC_THEME;

/** Общие стили компонентов классического шаблона. */
export const classicStyles = StyleSheet.create({
    page: {
        fontFamily: OFFER_PDF_FONT_FAMILY,
        fontSize: sizes.base,
        color: colors.text,
        paddingTop: page.paddingTop,
        paddingBottom: page.paddingBottom,
        paddingHorizontal: page.paddingHorizontal,
        lineHeight: 1.35,
    },
    section: { marginTop: 14 },
    h2: {
        fontSize: sizes.h2,
        fontWeight: 'bold',
        color: colors.accent,
        marginBottom: 6,
    },
    caption: { fontSize: sizes.sm, color: colors.muted },
    muted: { color: colors.muted },
    bold: { fontWeight: 'bold' },
    accent: { color: colors.accent },
    small: { fontSize: sizes.sm },
});
