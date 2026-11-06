import { StyleSheet } from '@react-pdf/renderer';
import { PDF_FONT_FAMILY } from '@lib/pdf-render';

/**
 * Оформление PDF отчёта собственнику: спокойная деловая вёрстка — тёмный
 * текст, один акцентный цвет, тонкие линии, плитки шапки, таблицы с
 * подписями. Размеры — в пунктах (A4: 595 × 842).
 */
export const OWNER_PDF_THEME = {
    colors: {
        text: '#1a1d23',
        muted: '#6b7280',
        accent: '#1f5fbf',
        line: '#d9dde3',
        tile: '#f3f5f8',
        card: '#f8f9fb',
        warning: '#b45309',
        success: '#15803d',
    },
    sizes: { xs: 7.5, sm: 8.5, base: 10, h1: 18, h2: 13, h3: 10.5, tile: 20 },
    page: {
        paddingTop: 44,
        paddingBottom: 52,
        paddingHorizontal: 40,
        edge: 24,
    },
} as const;

const { colors, sizes, page } = OWNER_PDF_THEME;

export const ownerPdfStyles = StyleSheet.create({
    page: {
        fontFamily: PDF_FONT_FAMILY,
        fontSize: sizes.base,
        color: colors.text,
        paddingTop: page.paddingTop,
        paddingBottom: page.paddingBottom,
        paddingHorizontal: page.paddingHorizontal,
        lineHeight: 1.35,
    },
    h1: { fontSize: sizes.h1, fontWeight: 'bold', marginBottom: 2 },
    subtitle: { fontSize: sizes.sm, color: colors.muted, marginBottom: 12 },
    section: { marginTop: 14 },
    h2: {
        fontSize: sizes.h2,
        fontWeight: 'bold',
        color: colors.accent,
        marginBottom: 6,
        paddingBottom: 3,
        borderBottomWidth: 0.75,
        borderBottomColor: colors.line,
    },
    h3: {
        fontSize: sizes.h3,
        fontWeight: 'bold',
        marginTop: 8,
        marginBottom: 3,
    },
    paragraph: { marginBottom: 5, textAlign: 'justify' },
    lead: { marginBottom: 5, fontWeight: 'bold', textAlign: 'justify' },
    muted: { color: colors.muted },
    small: { fontSize: sizes.sm },
    xs: { fontSize: sizes.xs },
    tiles: { flexDirection: 'row', gap: 6, marginBottom: 4 },
    tile: {
        flex: 1,
        backgroundColor: colors.tile,
        borderRadius: 4,
        padding: 7,
        minHeight: 64,
    },
    tileValue: {
        fontSize: sizes.tile,
        fontWeight: 'bold',
        color: colors.accent,
    },
    tileLabel: { fontSize: sizes.xs, color: colors.muted, marginTop: 2 },
    tileCompare: { fontSize: sizes.xs, color: colors.text, marginTop: 2 },
    card: {
        backgroundColor: colors.card,
        borderRadius: 4,
        padding: 8,
        marginBottom: 6,
    },
    cardTitle: { fontSize: sizes.h3, fontWeight: 'bold', marginBottom: 3 },
    cardLabel: { fontSize: sizes.xs, color: colors.muted, marginTop: 3 },
    cardRow: { flexDirection: 'row', gap: 8 },
    bullet: { flexDirection: 'row', marginBottom: 2 },
    bulletDot: { width: 10 },
    bulletText: { flex: 1 },
    verdict: { fontSize: sizes.h3, fontWeight: 'bold', marginBottom: 2 },
    footer: {
        position: 'absolute',
        bottom: page.edge,
        left: page.paddingHorizontal,
        right: page.paddingHorizontal,
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderTopWidth: 0.5,
        borderTopColor: colors.line,
        paddingTop: 5,
    },
    // Высота задана явно: у текста с render-пропом Yoga не знает содержимого.
    footerText: {
        fontSize: sizes.xs,
        color: colors.muted,
        height: sizes.xs * 1.4,
    },
});
