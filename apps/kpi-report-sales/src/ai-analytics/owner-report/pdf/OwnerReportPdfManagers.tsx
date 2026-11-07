import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { AiOwnerReportManagerDto } from '../../dto/ai-owner-report-text.dto';
import { OWNER_PDF_TEXT } from './owner-report-pdf.texts';
import { ownerPdfStyles as s } from './owner-report-pdf.styles';
import { OwnerReportPdfTable } from './OwnerReportPdfTable';

const Bullets: FC<{ title: string; items: readonly string[] }> = ({
    title,
    items,
}) =>
    items.length === 0 ? null : (
        <View>
            <Text style={s.cardLabel}>{title}</Text>
            {items.map(item => (
                <View key={item} style={s.bullet}>
                    <Text style={[s.small, s.bulletDot]}>•</Text>
                    <Text style={[s.small, s.bulletText]}>{item}</Text>
                </View>
            ))}
        </View>
    );

/** Сотрудники: таблица показателей и карточки с выводами. */
export const PdfManagers: FC<{ managers: AiOwnerReportManagerDto[] }> = ({
    managers,
}) => (
    <>
        <OwnerReportPdfTable
            columns={[
                {
                    label: OWNER_PDF_TEXT.columns.employee,
                    width: 2.4,
                    bold: true,
                },
                ...OWNER_PDF_TEXT.managerColumns.map(([, label]) => ({
                    label,
                    width: 1.5,
                    align: 'right' as const,
                })),
            ]}
            rows={managers.map(manager => [
                manager.name,
                ...OWNER_PDF_TEXT.managerColumns.map(
                    ([code]) => manager.cells[code] ?? '—',
                ),
            ])}
        />
        {managers.map(manager => (
            <View key={manager.managerId} style={s.card} wrap={false}>
                <Text style={s.cardTitle}>
                    {manager.name}
                    <Text
                        style={[s.small, s.muted]}
                    >{`  ·  ${manager.headline}`}</Text>
                </Text>
                <Bullets
                    title={OWNER_PDF_TEXT.manager.strengths}
                    items={manager.strengths}
                />
                <Bullets
                    title={OWNER_PDF_TEXT.manager.risks}
                    items={manager.risks}
                />
                <Text style={s.cardLabel}>
                    {OWNER_PDF_TEXT.manager.conclusion}
                </Text>
                <Text style={s.small}>{manager.conclusion}</Text>
            </View>
        ))}
    </>
);
