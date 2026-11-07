import type { FC, ReactNode } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type {
    AiOwnerReportLeakDto,
    AiOwnerReportManagementDto,
    AiOwnerReportMetricDto,
    AiOwnerReportObjectionsDto,
    AiOwnerReportIssuesDto,
    AiOwnerReportOverviewDto,
} from '../../dto/ai-owner-report-text.dto';
import { OWNER_PDF_TEXT } from './owner-report-pdf.texts';
import {
    OWNER_PDF_TONES,
    ownerPdfStyles as s,
} from './owner-report-pdf.styles';
import { PdfBadge, toneOfVerdict } from './OwnerReportPdfBadge';
import { OwnerReportPdfTable, type PdfColumn } from './OwnerReportPdfTable';

const C = OWNER_PDF_TEXT.columns;

/**
 * Сколько места нужно под заголовком, чтобы он не остался один внизу листа:
 * у раздела первым идёт карточка или таблица, у подраздела — шапка таблицы
 * и пара строк.
 */
const SECTION_PRESENCE = 120;
const SUBHEADING_PRESENCE = 70;

/**
 * Заголовок с запасом места: неразрывный блок «заголовок + невидимая
 * распорка», а отрицательный отступ возвращает следующий блок под сам
 * заголовок. Не влезает блок — переносится вместе с распоркой. Штатный
 * minPresenceAhead react-pdf заголовки-сироты не убирал (PDF 07.11.2026).
 */
const KeepWithNext: FC<{ space: number; children: ReactNode }> = ({
    space,
    children,
}) => (
    <View wrap={false} style={{ marginBottom: -space }}>
        {children}
        <View style={{ height: space }} />
    </View>
);

export const PdfSection: FC<{ title: string; children: ReactNode }> = ({
    title,
    children,
}) => (
    <View style={s.section}>
        <KeepWithNext space={SECTION_PRESENCE}>
            <Text style={s.h2}>{title}</Text>
        </KeepWithNext>
        {children}
    </View>
);

export const PdfSubheading: FC<{ title: string }> = ({ title }) => (
    <KeepWithNext space={SUBHEADING_PRESENCE}>
        <Text style={s.h3}>{title}</Text>
    </KeepWithNext>
);

export const PdfOverview: FC<{ overview: AiOwnerReportOverviewDto }> = ({
    overview,
}) => {
    const withUnmarked = overview.typeGroups.some(row => row.unmarked > 0);
    const typeColumns: PdfColumn[] = [
        { label: C.typeGroup, width: 4.4 },
        { label: C.calls, width: 1.6, align: 'right' },
        { label: C.advanced, width: 2.8, align: 'right' },
        { label: C.callbackDated, width: 1.7, align: 'right' },
        { label: C.postponed, width: 1.6, align: 'right' },
        { label: C.refused, width: 1.3, align: 'right' },
        { label: C.noContact, width: 1.6, align: 'right' },
        ...(withUnmarked
            ? [{ label: C.unmarked, width: 1.7, align: 'right' as const }]
            : []),
    ];
    return (
        <>
            <PdfSubheading title={OWNER_PDF_TEXT.sections.outcomes} />
            <OwnerReportPdfTable
                columns={[
                    { label: C.outcome, width: 6 },
                    { label: C.calls, width: 2, align: 'right' },
                    { label: C.share, width: 2, align: 'right' },
                ]}
                rows={overview.outcomes.map(row => [
                    row.label,
                    row.calls,
                    row.pct,
                ])}
            />
            <PdfSubheading title={OWNER_PDF_TEXT.sections.typeGroups} />
            <OwnerReportPdfTable
                columns={typeColumns}
                rows={overview.typeGroups.map(row => [
                    row.label,
                    row.calls,
                    row.advanced,
                    row.callbackDated,
                    row.postponed,
                    row.refused,
                    row.noContact,
                    ...(withUnmarked ? [row.unmarked] : []),
                ])}
            />
            <PdfSubheading title={OWNER_PDF_TEXT.sections.weeks} />
            <OwnerReportPdfTable
                columns={[
                    { label: C.week, width: 3.4 },
                    { label: C.calls, width: 1.6, align: 'right' },
                    { label: C.cold, width: 1.5, align: 'right' },
                    { label: C.coldAdvanced, width: 2.8, align: 'right' },
                    { label: C.contacted, width: 1.6, align: 'right' },
                    { label: C.contactedAdvanced, width: 2.8, align: 'right' },
                    { label: C.note, width: 3.2, muted: true },
                ]}
                rows={overview.weeks.map(row => [
                    row.label,
                    row.calls,
                    row.cold,
                    row.coldAdvanced,
                    row.contacted,
                    row.contactedAdvanced,
                    row.note ?? '',
                ])}
            />
            {overview.notes.map(note => (
                <Text key={note} style={s.note}>
                    {note}
                </Text>
            ))}
        </>
    );
};

export const PdfLeaks: FC<{ leaks: AiOwnerReportLeakDto[] }> = ({ leaks }) => (
    <>
        {leaks.map(leak => (
            <View
                key={leak.code}
                style={[s.card, { borderLeftColor: OWNER_PDF_TONES.bad.edge }]}
                wrap={false}
            >
                <View style={s.cardHead}>
                    <Text style={s.cardTitle}>{leak.title}</Text>
                    <PdfBadge tone="warn" label={leak.nature} />
                </View>
                {/* Шаблонный абзац повторяет заголовок и масштаб — только текст модели. */}
                {leak.source === 'model' && (
                    <Text style={s.paragraph}>{leak.text}</Text>
                )}
                <View style={s.cardRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={s.cardLabel}>
                            {OWNER_PDF_TEXT.leak.scale}
                        </Text>
                        <Text style={s.small}>{leak.scale}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={s.cardLabel}>
                            {OWNER_PDF_TEXT.leak.money}
                        </Text>
                        <Text style={[s.small, { fontWeight: 'bold' }]}>
                            {leak.money ?? OWNER_PDF_TEXT.leak.noMoney}
                        </Text>
                    </View>
                </View>
                <Text style={s.cardLabel}>{OWNER_PDF_TEXT.leak.action}</Text>
                <Text style={s.small}>{leak.action}</Text>
            </View>
        ))}
    </>
);

export const PdfManagement: FC<{ management: AiOwnerReportManagementDto }> = ({
    management,
}) => {
    const tone = OWNER_PDF_TONES[toneOfVerdict(management.verdict)];
    return (
        <>
            <View style={[s.verdict, { backgroundColor: tone.bg }]}>
                <Text style={[s.verdictText, { color: tone.fg }]}>
                    {management.verdict}
                </Text>
                <Text style={s.small}>{management.verdictText}</Text>
            </View>
            <OwnerReportPdfTable
                columns={[
                    { label: C.sign, width: 3.2, bold: true },
                    { label: C.verdict, width: 1.8, badge: toneOfVerdict },
                    { label: C.detail, width: 6, muted: true },
                ]}
                rows={management.rows.map(row => [
                    row.title,
                    row.verdict,
                    row.detail,
                ])}
            />
        </>
    );
};

export const PdfObjections: FC<{
    objections: AiOwnerReportObjectionsDto;
    issues: AiOwnerReportIssuesDto;
}> = ({ objections, issues }) => (
    <>
        <Text style={s.paragraph}>{objections.intro}</Text>
        {objections.rows.length > 0 && (
            <OwnerReportPdfTable
                columns={[
                    { label: C.topic, width: 5 },
                    { label: C.calls, width: 1.6, align: 'right' },
                    { label: C.handled, width: 2, align: 'right' },
                    { label: C.advancedAfter, width: 2.4, align: 'right' },
                ]}
                rows={objections.rows.map(row => [
                    row.label,
                    row.calls,
                    row.handled,
                    row.advancedAfter,
                ])}
            />
        )}
        {objections.coldTop && <Text style={s.note}>{objections.coldTop}</Text>}
        <PdfSubheading title={OWNER_PDF_TEXT.sections.issues} />
        <Text style={s.paragraph}>{issues.intro}</Text>
        {issues.rows.length > 0 && (
            <OwnerReportPdfTable
                columns={[
                    { label: C.issue, width: 7 },
                    { label: C.calls, width: 2, align: 'right' },
                ]}
                rows={issues.rows.map(row => [row.label, row.calls])}
            />
        )}
    </>
);

export const PdfMetrics: FC<{ metrics: AiOwnerReportMetricDto[] }> = ({
    metrics,
}) => (
    <OwnerReportPdfTable
        columns={[
            { label: C.metric, width: 3.4, bold: true },
            { label: C.value, width: 1.8, align: 'right' },
            { label: C.lastWeek, width: 1.8, align: 'right' },
            { label: C.why, width: 3, muted: true },
            { label: C.ifIgnored, width: 3, muted: true },
        ]}
        rows={metrics.map(metric => [
            metric.title,
            metric.value,
            metric.lastWeek ?? '—',
            metric.why,
            metric.ifIgnored,
        ])}
    />
);
