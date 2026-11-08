import { StyleSheet } from '@react-pdf/renderer';
import { PDF_FONT_FAMILY } from '@lib/pdf-render';
import type { OwnerReportTone } from '@lib/sales-ai-analytics';

/**
 * Оформление PDF отчёта собственнику: деловая вёрстка — тёмный текст, один
 * акцентный цвет, тона оценок (хорошо / внимание / плохо) на плитках,
 * бейджах и левых кромках карточек. Размеры — в пунктах (A4: 595 × 842).
 *
 * Высота строки задана явно у каждого крупного текста: react-pdf переводит
 * множитель страницы в пункты по её кеглю (10 × 1,35) и наследует уже
 * пункты — у заголовка и цифр плиток строка выходила ниже шрифта, и
 * следующая строка наезжала на них (PDF 07.11.2026).
 */
export const OWNER_PDF_THEME = {
    colors: {
        text: '#1a1d23',
        muted: '#6b7280',
        accent: '#1f5fbf',
        line: '#d9dde3',
        tile: '#f3f5f8',
        card: '#f8f9fb',
    },
    sizes: { xs: 7.5, sm: 8.5, base: 10, h1: 18, h2: 13, h3: 10.5, tile: 20 },
    page: {
        paddingTop: 26,
        paddingBottom: 36,
        paddingHorizontal: 40,
    },
} as const;

/** Цвета тонов: текст, заливка, кромка. */
export const OWNER_PDF_TONES: Readonly<
    Record<OwnerReportTone, { fg: string; bg: string; edge: string }>
> = {
    good: { fg: '#15803d', bg: '#e9f6ee', edge: '#5fb77d' },
    warn: { fg: '#a15c07', bg: '#fdf4e4', edge: '#e9a93f' },
    bad: { fg: '#b42318', bg: '#fdeceb', edge: '#e5675c' },
    neutral: { fg: '#1f5fbf', bg: '#f3f5f8', edge: '#9fb6d9' },
};

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
    header: { marginBottom: 10 },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 3,
    },
    headerText: { fontSize: sizes.xs, lineHeight: 1.3, color: colors.muted },
    topBar: { height: 3, backgroundColor: colors.accent, borderRadius: 1.5 },
    h1: {
        fontSize: sizes.h1,
        fontWeight: 'bold',
        lineHeight: 1.25,
        marginBottom: 3,
    },
    subtitle: {
        fontSize: sizes.sm,
        lineHeight: 1.4,
        color: colors.muted,
        marginBottom: 12,
    },
    section: { marginTop: 16 },
    h2: {
        fontSize: sizes.h2,
        fontWeight: 'bold',
        lineHeight: 1.3,
        color: colors.accent,
        marginBottom: 6,
        paddingBottom: 3,
        borderBottomWidth: 0.75,
        borderBottomColor: colors.line,
    },
    h3: {
        fontSize: sizes.h3,
        fontWeight: 'bold',
        lineHeight: 1.3,
        marginTop: 9,
        marginBottom: 3,
    },
    paragraph: { marginBottom: 5, textAlign: 'justify' },
    lead: { marginBottom: 6, fontWeight: 'bold', textAlign: 'justify' },
    muted: { color: colors.muted },
    small: { fontSize: sizes.sm, lineHeight: 1.4 },
    xs: { fontSize: sizes.xs, lineHeight: 1.4 },
    note: {
        fontSize: sizes.sm,
        lineHeight: 1.4,
        color: colors.muted,
        marginTop: 2,
    },
    tiles: { flexDirection: 'row', gap: 6, marginBottom: 4 },
    tile: {
        flex: 1,
        borderRadius: 4,
        borderTopWidth: 3,
        paddingHorizontal: 7,
        paddingTop: 6,
        paddingBottom: 7,
        minHeight: 74,
    },
    tileValue: {
        fontSize: sizes.tile,
        fontWeight: 'bold',
        lineHeight: 1.15,
        marginBottom: 3,
    },
    tileLabel: { fontSize: sizes.xs, lineHeight: 1.35, color: colors.text },
    tileCompare: {
        fontSize: sizes.xs,
        lineHeight: 1.35,
        color: colors.muted,
        marginTop: 3,
    },
    card: {
        backgroundColor: colors.card,
        borderRadius: 4,
        borderLeftWidth: 3,
        borderLeftColor: colors.line,
        padding: 8,
        marginBottom: 6,
    },
    cardHead: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 3,
    },
    cardTitle: { fontSize: sizes.h3, fontWeight: 'bold', lineHeight: 1.3 },
    cardLabel: {
        fontSize: sizes.xs,
        lineHeight: 1.35,
        color: colors.muted,
        marginTop: 4,
    },
    cardRow: { flexDirection: 'row', gap: 8 },
    bullet: { flexDirection: 'row', marginBottom: 2 },
    bulletMark: { width: 10, fontSize: sizes.sm, fontWeight: 'bold' },
    bulletText: { flex: 1, fontSize: sizes.sm, lineHeight: 1.4 },
    verdict: {
        borderRadius: 4,
        paddingHorizontal: 8,
        paddingVertical: 5,
        marginBottom: 5,
    },
    verdictText: { fontSize: sizes.h3, fontWeight: 'bold', lineHeight: 1.3 },
});
