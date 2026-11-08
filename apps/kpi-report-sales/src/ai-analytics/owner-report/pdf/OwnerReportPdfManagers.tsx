import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { AiOwnerReportManagerDto } from '../../dto/ai-owner-report-text.dto';
import { OWNER_PDF_TEXT } from './owner-report-pdf.texts';
import {
    OWNER_PDF_TONES,
    ownerPdfStyles as s,
} from './owner-report-pdf.styles';
import { PdfBadge, toneOfManager } from './OwnerReportPdfBadge';
import { PdfSubheading } from './OwnerReportPdfSections';
import { OwnerReportPdfTable } from './OwnerReportPdfTable';

const Bullets: FC<{
    title: string;
    items: readonly string[];
    mark: string;
    color: string;
}> = ({ title, items, mark, color }) =>
    items.length === 0 ? null : (
        <View>
            <Text style={s.cardLabel}>{title}</Text>
            {items.map(item => (
                <View key={item} style={s.bullet}>
                    <Text style={[s.bulletMark, { color }]}>{mark}</Text>
                    <Text style={s.bulletText}>{item}</Text>
                </View>
            ))}
        </View>
    );

const ManagersTable: FC<{
    managers: AiOwnerReportManagerDto[];
    columns: readonly (readonly [string, string])[];
}> = ({ managers, columns }) => (
    <OwnerReportPdfTable
        compact
        columns={[
            { label: OWNER_PDF_TEXT.columns.employee, width: 2.2, bold: true },
            ...columns.map(([, label]) => ({
                label,
                width: 1.6,
                align: 'right' as const,
            })),
        ]}
        rows={managers.map(manager => [
            manager.name,
            ...columns.map(([code]) => manager.cells[code] ?? '—'),
        ])}
    />
);

/** Сотрудники: две таблицы (результат, разговор) и карточки с выводами. */
export const PdfManagers: FC<{ managers: AiOwnerReportManagerDto[] }> = ({
    managers,
}) => (
    <>
        <PdfSubheading title={OWNER_PDF_TEXT.sections.managersResult} />
        <ManagersTable
            managers={managers}
            columns={OWNER_PDF_TEXT.managerResultColumns}
        />
        <PdfSubheading title={OWNER_PDF_TEXT.sections.managersTalk} />
        <ManagersTable
            managers={managers}
            columns={OWNER_PDF_TEXT.managerTalkColumns}
        />
        <PdfSubheading title={OWNER_PDF_TEXT.sections.managerCards} />
        {managers.map(manager => {
            const tone = toneOfManager(manager.strengths, manager.risks);
            return (
                <View
                    key={manager.managerId}
                    style={[
                        s.card,
                        { borderLeftColor: OWNER_PDF_TONES[tone].edge },
                    ]}
                    wrap={false}
                >
                    <View style={s.cardHead}>
                        <Text style={s.cardTitle}>{manager.name}</Text>
                        <PdfBadge tone={tone} label={manager.headline} />
                    </View>
                    <Bullets
                        title={OWNER_PDF_TEXT.manager.strengths}
                        items={manager.strengths}
                        mark="+"
                        color={OWNER_PDF_TONES.good.fg}
                    />
                    <Bullets
                        title={OWNER_PDF_TEXT.manager.risks}
                        items={manager.risks}
                        mark="!"
                        color={OWNER_PDF_TONES.bad.fg}
                    />
                    <Text style={s.cardLabel}>
                        {OWNER_PDF_TEXT.manager.conclusion}
                    </Text>
                    <Text style={s.small}>{manager.conclusion}</Text>
                </View>
            );
        })}
    </>
);
