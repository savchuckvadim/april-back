import type { FC } from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { AiOwnerReportDto } from '../../dto/ai-owner-report.dto';
import { OWNER_PDF_TEXT } from './owner-report-pdf.texts';
import { ownerPdfStyles as s } from './owner-report-pdf.styles';
import { PdfManagers } from './OwnerReportPdfManagers';
import {
    PdfLeaks,
    PdfManagement,
    PdfMetrics,
    PdfObjections,
    PdfOverview,
    PdfSection,
} from './OwnerReportPdfSections';

interface OwnerReportPdfDocumentProps {
    report: AiOwnerReportDto;
    /** Дата сборки словами (считает сервис по TZ портала). */
    generatedAtText: string;
}

const Footer: FC = () => (
    <View style={s.footer} fixed>
        <Text style={s.footerText}>{OWNER_PDF_TEXT.footer.brand}</Text>
        <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) =>
                OWNER_PDF_TEXT.footer.page(pageNumber, totalPages)
            }
        />
    </View>
);

/** PDF отчёта собственнику: шапка с плитками, затем разделы в порядке подачи. */
export const OwnerReportPdfDocument: FC<OwnerReportPdfDocumentProps> = ({
    report,
    generatedAtText,
}) => {
    const { text } = report;
    return (
        <Document
            title={`${text.title} — ${text.periodLabel}`}
            author="April"
            language="ru"
        >
            <Page size="A4" style={s.page}>
                <Text style={s.h1}>{text.title}</Text>
                <Text style={s.subtitle}>
                    {text.periodLabel} ·{' '}
                    {OWNER_PDF_TEXT.generatedAt(generatedAtText)} ·{' '}
                    {OWNER_PDF_TEXT.writtenBy[report.source]}
                </Text>
                <View style={s.tiles}>
                    {text.tiles.map(tile => (
                        <View key={tile.code} style={s.tile}>
                            <Text style={s.tileValue}>{tile.value}</Text>
                            <Text style={s.tileLabel}>{tile.label}</Text>
                            {tile.compare && (
                                <Text style={s.tileCompare}>
                                    {tile.compare}
                                </Text>
                            )}
                        </View>
                    ))}
                </View>
                <PdfSection title={OWNER_PDF_TEXT.sections.summary}>
                    {text.summary.map((paragraph, index) => (
                        <Text
                            key={paragraph}
                            style={index === 0 ? s.lead : s.paragraph}
                        >
                            {paragraph}
                        </Text>
                    ))}
                </PdfSection>
                <PdfSection title={OWNER_PDF_TEXT.sections.overview}>
                    <PdfOverview overview={text.overview} />
                </PdfSection>
                <PdfSection title={OWNER_PDF_TEXT.sections.leaks}>
                    <PdfLeaks leaks={text.leaks} />
                </PdfSection>
                <PdfSection title={OWNER_PDF_TEXT.sections.management}>
                    <PdfManagement management={text.management} />
                </PdfSection>
                <PdfSection title={OWNER_PDF_TEXT.sections.objections}>
                    <PdfObjections
                        objections={text.objections}
                        issues={text.issues}
                    />
                </PdfSection>
                <PdfSection title={OWNER_PDF_TEXT.sections.metrics}>
                    <PdfMetrics metrics={text.controlMetrics} />
                </PdfSection>
                <PdfSection title={OWNER_PDF_TEXT.sections.managers}>
                    <PdfManagers managers={text.managers} />
                </PdfSection>
                <PdfSection title={OWNER_PDF_TEXT.sections.methodology}>
                    {text.methodology.map(line => (
                        <Text
                            key={line}
                            style={[s.small, s.muted, { marginBottom: 3 }]}
                        >
                            {line}
                        </Text>
                    ))}
                </PdfSection>
                <Footer />
            </Page>
        </Document>
    );
};
