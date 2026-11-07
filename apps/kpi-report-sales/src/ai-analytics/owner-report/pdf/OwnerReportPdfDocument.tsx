import type { FC } from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { AiOwnerReportDto } from '../../dto/ai-owner-report.dto';
import { OWNER_PDF_TEXT } from './owner-report-pdf.texts';
import { ownerPdfStyles as s } from './owner-report-pdf.styles';
import { PdfManagers } from './OwnerReportPdfManagers';
import { PdfAttention, PdfGlossary, PdfTiles } from './OwnerReportPdfReading';
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

/**
 * Колонтитул сверху на каждом листе: бренд, период и полоса. Номера
 * страницы нет: текст с render-пропом react-pdf 4.9 рисует нестабильно
 * (в подвале — никогда, в колонтитуле — через раз; проверено 07.11.2026).
 */
const Header: FC<{ periodLabel: string }> = ({ periodLabel }) => (
    <View style={s.header} fixed>
        <View style={s.headerRow}>
            <Text style={s.headerText}>{OWNER_PDF_TEXT.footer.brand}</Text>
            <Text style={s.headerText}>{periodLabel}</Text>
        </View>
        <View style={s.topBar} />
    </View>
);

/**
 * PDF отчёта собственнику: шапка с цветными плитками, «на что обратить
 * внимание», резюме, словарь терминов, затем разделы в порядке подачи.
 */
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
                <Header periodLabel={text.periodLabel} />
                <Text style={s.h1}>{text.title}</Text>
                <Text style={s.subtitle}>
                    {text.periodLabel} ·{' '}
                    {OWNER_PDF_TEXT.generatedAt(generatedAtText)} ·{' '}
                    {OWNER_PDF_TEXT.writtenBy[report.source]}
                </Text>
                <PdfTiles tiles={text.tiles} />
                <PdfAttention items={text.attention} />
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
                <PdfSection title={OWNER_PDF_TEXT.sections.glossary}>
                    <PdfGlossary items={text.glossary} />
                </PdfSection>
                <PdfSection title={OWNER_PDF_TEXT.sections.overview}>
                    <PdfOverview overview={text.overview} />
                </PdfSection>
                {text.leaks.length > 0 && (
                    <PdfSection title={OWNER_PDF_TEXT.sections.leaks}>
                        <PdfLeaks leaks={text.leaks} />
                    </PdfSection>
                )}
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
                        <Text key={line} style={[s.note, { marginBottom: 3 }]}>
                            {line}
                        </Text>
                    ))}
                </PdfSection>
            </Page>
        </Document>
    );
};
