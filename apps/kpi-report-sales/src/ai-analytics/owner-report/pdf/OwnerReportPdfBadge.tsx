import type { FC } from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import {
    MANAGEMENT_VERDICT_LABELS,
    SIGN_VERDICT_LABELS,
    type OwnerReportTone,
} from '@lib/sales-ai-analytics';
import { OWNER_PDF_THEME, OWNER_PDF_TONES } from './owner-report-pdf.styles';

const styles = StyleSheet.create({
    badge: {
        borderRadius: 6,
        paddingHorizontal: 5,
        paddingTop: 1.5,
        paddingBottom: 1,
        alignSelf: 'flex-start',
    },
    text: {
        fontSize: OWNER_PDF_THEME.sizes.xs,
        lineHeight: 1.3,
        fontWeight: 'bold',
    },
});

/** Бейдж: короткая подпись на заливке тона. */
export const PdfBadge: FC<{ tone: OwnerReportTone; label: string }> = ({
    tone,
    label,
}) => (
    <View style={[styles.badge, { backgroundColor: OWNER_PDF_TONES[tone].bg }]}>
        <Text style={[styles.text, { color: OWNER_PDF_TONES[tone].fg }]}>
            {label}
        </Text>
    </View>
);

/**
 * Тон по русской подписи вердикта: текст отчёта приходит готовыми фразами,
 * подписи — из тех же справочников lib, так что сопоставление точное.
 */
const TONE_BY_LABEL: ReadonlyMap<string, OwnerReportTone> = new Map([
    [SIGN_VERDICT_LABELS.yes, 'good'],
    [SIGN_VERDICT_LABELS.partial, 'warn'],
    [SIGN_VERDICT_LABELS.no, 'bad'],
    [SIGN_VERDICT_LABELS.unknown, 'neutral'],
    [MANAGEMENT_VERDICT_LABELS.managed, 'good'],
    [MANAGEMENT_VERDICT_LABELS.partial, 'warn'],
    [MANAGEMENT_VERDICT_LABELS.not_managed, 'bad'],
]);

export function toneOfVerdict(label: string): OwnerReportTone {
    return TONE_BY_LABEL.get(label) ?? 'neutral';
}

/** Тон карточки сотрудника: только плюсы — хорошо, только риски — плохо. */
export function toneOfManager(
    strengths: readonly string[],
    risks: readonly string[],
): OwnerReportTone {
    if (risks.length === 0) return strengths.length > 0 ? 'good' : 'neutral';
    return strengths.length > 0 ? 'warn' : 'bad';
}
