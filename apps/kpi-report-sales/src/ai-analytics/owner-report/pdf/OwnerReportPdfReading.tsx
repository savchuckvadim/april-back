import type { FC } from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import type {
    AiOwnerReportAttentionDto,
    AiOwnerReportGlossaryItemDto,
    AiOwnerReportTileDto,
} from '../../dto/ai-owner-report-text.dto';
import { OWNER_PDF_TEXT } from './owner-report-pdf.texts';
import {
    OWNER_PDF_THEME,
    OWNER_PDF_TONES,
    ownerPdfStyles as s,
} from './owner-report-pdf.styles';
import { PdfBadge } from './OwnerReportPdfBadge';

const { colors, sizes } = OWNER_PDF_THEME;

const styles = StyleSheet.create({
    attention: {
        marginTop: 10,
        borderRadius: 4,
        borderLeftWidth: 3,
        borderLeftColor: OWNER_PDF_TONES.warn.edge,
        backgroundColor: '#fffaf0',
        paddingHorizontal: 9,
        paddingVertical: 7,
    },
    attentionTitle: {
        fontSize: sizes.h3,
        fontWeight: 'bold',
        lineHeight: 1.3,
        marginBottom: 4,
    },
    item: { marginBottom: 5 },
    itemHead: { flexDirection: 'row', gap: 5, alignItems: 'flex-start' },
    itemTitle: {
        flex: 1,
        fontSize: sizes.sm,
        lineHeight: 1.4,
        fontWeight: 'bold',
    },
    itemAction: {
        fontSize: sizes.sm,
        lineHeight: 1.4,
        color: colors.text,
        marginTop: 1,
    },
    glossary: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 },
    term: { width: '48%', marginBottom: 5 },
    termName: { fontSize: sizes.sm, lineHeight: 1.35, fontWeight: 'bold' },
    termMeaning: { fontSize: sizes.xs, lineHeight: 1.4, color: colors.muted },
});

/** Плитки шапки: цвет кромки и числа — по оценке доли. */
export const PdfTiles: FC<{ tiles: AiOwnerReportTileDto[] }> = ({ tiles }) => (
    <View style={s.tiles}>
        {tiles.map(tile => {
            const tone = OWNER_PDF_TONES[tile.tone];
            return (
                <View
                    key={tile.code}
                    style={[
                        s.tile,
                        { backgroundColor: tone.bg, borderTopColor: tone.edge },
                    ]}
                >
                    <Text style={[s.tileValue, { color: tone.fg }]}>
                        {tile.value}
                    </Text>
                    <Text style={s.tileLabel}>{tile.label}</Text>
                    {tile.compare && (
                        <Text style={s.tileCompare}>{tile.compare}</Text>
                    )}
                </View>
            );
        })}
    </View>
);

/** «На что обратить внимание»: что не так и одно действие. */
export const PdfAttention: FC<{ items: AiOwnerReportAttentionDto[] }> = ({
    items,
}) =>
    items.length === 0 ? null : (
        <View style={styles.attention} wrap={false}>
            <Text style={styles.attentionTitle}>
                {OWNER_PDF_TEXT.sections.attention}
            </Text>
            {items.map(item => (
                <View key={item.title} style={styles.item}>
                    <View style={styles.itemHead}>
                        <PdfBadge
                            tone={item.tone}
                            label={OWNER_PDF_TEXT.attentionKind[item.tone]}
                        />
                        <Text style={styles.itemTitle}>{item.title}</Text>
                    </View>
                    <Text style={styles.itemAction}>
                        {OWNER_PDF_TEXT.attentionAction}
                        {item.action}
                    </Text>
                </View>
            ))}
        </View>
    );

/** «Как читать отчёт»: термины в две колонки. */
export const PdfGlossary: FC<{ items: AiOwnerReportGlossaryItemDto[] }> = ({
    items,
}) => (
    <View style={styles.glossary}>
        {items.map(item => (
            <View key={item.term} style={styles.term} wrap={false}>
                <Text style={styles.termName}>{item.term}</Text>
                <Text style={styles.termMeaning}>{item.meaning}</Text>
            </View>
        ))}
    </View>
);
