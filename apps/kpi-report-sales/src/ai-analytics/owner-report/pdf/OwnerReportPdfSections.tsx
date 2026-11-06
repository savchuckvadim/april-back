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
import { ownerPdfStyles as s } from './owner-report-pdf.styles';
import { OwnerReportPdfTable } from './OwnerReportPdfTable';

const C = OWNER_PDF_TEXT.columns;

export const PdfSection: FC<{ title: string; children: ReactNode }> = ({
    title,
    children,
}) => (
    <View style={s.section}>
        <Text style={s.h2}>{title}</Text>
        {children}
    </View>
);

export const PdfOverview: FC<{ overview: AiOwnerReportOverviewDto }> = ({
    overview,
}) => (
    <>
        <Text style={s.h3}>{OWNER_PDF_TEXT.sections.outcomes}</Text>
        <OwnerReportPdfTable
            columns={[
                { label: C.outcome, width: 6 },
                { label: C.calls, width: 2, align: 'right' },
                { label: C.share, width: 2, align: 'right' },
            ]}
            rows={overview.outcomes.map(row => [row.label, row.calls, row.pct])}
        />
        <Text style={s.h3}>{OWNER_PDF_TEXT.sections.typeGroups}</Text>
        <OwnerReportPdfTable
            columns={[
                { label: C.typeGroup, width: 5 },
                { label: C.calls, width: 1.6, align: 'right' },
                { label: C.advanced, width: 3 },
                { label: C.callbackDated, width: 1.8, align: 'right' },
                { label: C.postponed, width: 1.8, align: 'right' },
                { label: C.refused, width: 1.4, align: 'right' },
                { label: C.noContact, width: 1.8, align: 'right' },
            ]}
            rows={overview.typeGroups.map(row => [
                row.label,
                row.calls,
                row.advanced,
                row.callbackDated,
                row.postponed,
                row.refused,
                row.noContact,
            ])}
        />
        <Text style={s.h3}>{OWNER_PDF_TEXT.sections.weeks}</Text>
        <OwnerReportPdfTable
            columns={[
                { label: C.week, width: 3.6 },
                { label: C.calls, width: 1.6, align: 'right' },
                { label: C.cold, width: 1.6, align: 'right' },
                { label: C.coldAdvanced, width: 3 },
                { label: C.contacted, width: 1.8, align: 'right' },
                { label: C.contactedAdvanced, width: 3 },
                { label: C.note, width: 3.4, muted: true },
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
            <Text key={note} style={[s.small, s.muted]}>
                {note}
            </Text>
        ))}
    </>
);

export const PdfLeaks: FC<{ leaks: AiOwnerReportLeakDto[] }> = ({ leaks }) => (
    <>
        {leaks.map(leak => (
            <View key={leak.code} style={s.card} wrap={false}>
                <Text style={s.cardTitle}>{leak.title}</Text>
                <Text style={s.paragraph}>{leak.text}</Text>
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
                        <Text style={s.small}>
                            {leak.money ?? OWNER_PDF_TEXT.leak.noMoney}
                        </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={s.cardLabel}>
                            {OWNER_PDF_TEXT.leak.nature}
                        </Text>
                        <Text style={s.small}>{leak.nature}</Text>
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
}) => (
    <>
        <Text style={s.verdict}>{management.verdict}</Text>
        <Text style={[s.small, s.muted, { marginBottom: 4 }]}>
            {management.verdictText}
        </Text>
        <OwnerReportPdfTable
            columns={[
                { label: C.sign, width: 3.2, bold: true },
                { label: C.verdict, width: 1.6 },
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

export const PdfObjections: FC<{
    objections: AiOwnerReportObjectionsDto;
    issues: AiOwnerReportIssuesDto;
}> = ({ objections, issues }) => (
    <>
        <Text style={s.paragraph}>{objections.intro}</Text>
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
        {objections.coldTop && (
            <Text style={[s.small, s.muted]}>{objections.coldTop}</Text>
        )}
        <Text style={s.h3}>{OWNER_PDF_TEXT.sections.issues}</Text>
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
            { label: C.value, width: 1.8 },
            { label: C.lastWeek, width: 1.8 },
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
