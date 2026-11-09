import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type {
    AiOwnerReportCrmFunnelDto,
    AiOwnerReportFunnelDto,
    AiOwnerReportKeyValueDto,
    AiOwnerReportPresentationsDto,
} from '../../dto/ai-owner-report-text.dto';
import { OWNER_PDF_TEXT } from './owner-report-pdf.texts';
import {
    OWNER_PDF_TONES,
    ownerPdfStyles as s,
} from './owner-report-pdf.styles';
import { PdfSubheading } from './OwnerReportPdfSections';
import { OwnerReportPdfTable } from './OwnerReportPdfTable';

const C = OWNER_PDF_TEXT.columns;

/** Карточка-вывод с цветной кромкой: заголовок и одна фраза. */
const PdfCallout: FC<{ title: string; text: string; edge: string }> = ({
    title,
    text,
    edge,
}) => (
    <View style={[s.card, { borderLeftColor: edge }]} wrap={false}>
        <Text style={s.cardTitle}>{title}</Text>
        <Text style={s.small}>{text}</Text>
    </View>
);

const KeyValueTable: FC<{ rows: AiOwnerReportKeyValueDto[] }> = ({ rows }) => (
    <OwnerReportPdfTable
        columns={[
            { label: C.indicator, width: 5 },
            { label: C.value, width: 3, align: 'right' },
        ]}
        rows={rows.map(row => [row.label, row.value])}
    />
);

/** «Воронка и конверсии»: ступени по разговорам, цепочка, деньги после КП, воронка по CRM. */
export const PdfFunnel: FC<{
    funnel: AiOwnerReportFunnelDto;
    crm: AiOwnerReportCrmFunnelDto | null;
}> = ({ funnel, crm }) => (
    <>
        <OwnerReportPdfTable
            columns={[
                { label: C.stage, width: 4.4 },
                { label: C.calls, width: 1.5, align: 'right' },
                { label: C.advanced, width: 2.4, align: 'right' },
                { label: C.undecided, width: 2.4, align: 'right' },
                { label: C.refused, width: 2, align: 'right' },
                { label: C.noContact, width: 2, align: 'right' },
                { label: C.invoiceAgreed, width: 2.4, align: 'right' },
            ]}
            rows={funnel.rows.map(row => [
                row.label,
                row.calls,
                row.advanced,
                row.undecided,
                row.refused,
                row.noContact,
                row.invoiceAgreed,
            ])}
        />
        {funnel.chain && <Text style={s.paragraph}>{funnel.chain}</Text>}
        {funnel.afterOffer && (
            <PdfCallout
                title={OWNER_PDF_TEXT.funnel.afterOfferTitle}
                text={funnel.afterOffer}
                edge={OWNER_PDF_TONES.bad.edge}
            />
        )}
        <Text style={s.note}>{funnel.invoice}</Text>
        {crm && (
            <>
                <PdfSubheading title={OWNER_PDF_TEXT.sections.crmFunnel} />
                <OwnerReportPdfTable
                    columns={[
                        { label: C.indicator, width: 5 },
                        { label: C.value, width: 2, align: 'right' },
                        { label: C.previous, width: 2.5, align: 'right' },
                    ]}
                    rows={crm.rows.map(row => [
                        row.label,
                        row.value,
                        row.previous ?? '—',
                    ])}
                />
                <Text style={s.paragraph}>{crm.conversions}</Text>
                <Text style={s.note}>{crm.note}</Text>
            </>
        )}
    </>
);

/** «Презентации»: сводка показов, пара «под задачи против шаблонного», оценки разделов. */
export const PdfPresentations: FC<{
    presentations: AiOwnerReportPresentationsDto;
}> = ({ presentations }) => (
    <>
        <Text style={s.paragraph}>{presentations.intro}</Text>
        {presentations.comparison && (
            <PdfCallout
                title={OWNER_PDF_TEXT.presentations.comparisonTitle}
                text={presentations.comparison}
                edge={OWNER_PDF_TONES.good.edge}
            />
        )}
        {presentations.rows.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 14 }}>
                <View style={{ flex: 1 }}>
                    <PdfSubheading
                        title={OWNER_PDF_TEXT.sections.presentationRows}
                    />
                    <KeyValueTable rows={presentations.rows} />
                </View>
                {presentations.sections.length > 0 && (
                    <View style={{ flex: 1 }}>
                        <PdfSubheading
                            title={OWNER_PDF_TEXT.sections.presentationSections}
                        />
                        <KeyValueTable rows={presentations.sections} />
                    </View>
                )}
            </View>
        )}
        {presentations.people && (
            <Text style={s.note}>{presentations.people}</Text>
        )}
    </>
);
