import type { FC } from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import type { OwnerReportTone } from '@lib/sales-ai-analytics';
import { OWNER_PDF_THEME } from './owner-report-pdf.styles';
import { PdfBadge } from './OwnerReportPdfBadge';

const { colors, sizes } = OWNER_PDF_THEME;

const styles = StyleSheet.create({
    table: { marginBottom: 4 },
    head: {
        flexDirection: 'row',
        borderBottomWidth: 0.75,
        borderBottomColor: colors.line,
        paddingBottom: 2,
        marginBottom: 1,
    },
    row: {
        flexDirection: 'row',
        borderBottomWidth: 0.4,
        borderBottomColor: colors.line,
        paddingVertical: 2.5,
    },
    zebra: { backgroundColor: '#fafbfc' },
    // Поля с обеих сторон: число справа и доля слева больше не слипаются.
    headCell: {
        fontSize: sizes.xs,
        lineHeight: 1.3,
        color: colors.muted,
        paddingHorizontal: 3,
    },
    cell: { fontSize: sizes.sm, lineHeight: 1.35, paddingHorizontal: 3 },
    compact: { fontSize: sizes.xs },
    right: { textAlign: 'right' },
    bold: { fontWeight: 'bold' },
    mutedCell: { color: colors.muted },
    badgeCell: { paddingHorizontal: 3 },
});

/** Колонка таблицы: подпись, ширина (доля) и выравнивание. */
export interface PdfColumn {
    label: string;
    /** Ширина в долях от ширины таблицы (сумма — любая, нормализуется). */
    width: number;
    align?: 'left' | 'right';
    muted?: boolean;
    bold?: boolean;
    /** Ячейка бейджем: тон по значению (вердикт и т.п.). */
    badge?: (value: string) => OwnerReportTone;
}

interface OwnerReportPdfTableProps {
    columns: readonly PdfColumn[];
    rows: readonly (readonly (string | number)[])[];
    /** Мелкий кегль ячеек — для широких таблиц (сотрудники). */
    compact?: boolean;
}

/** Таблица: строки — массивы ячеек по колонкам; длинные строки переносятся. */
export const OwnerReportPdfTable: FC<OwnerReportPdfTableProps> = ({
    columns,
    rows,
    compact,
}) => {
    const total = columns.reduce((sum, column) => sum + column.width, 0);
    const widthOf = (column: PdfColumn): string =>
        `${(column.width / total) * 100}%`;
    return (
        <View style={styles.table}>
            <View style={styles.head} fixed>
                {columns.map(column => (
                    <Text
                        key={column.label}
                        style={[
                            styles.headCell,
                            { width: widthOf(column) },
                            column.align === 'right' ? styles.right : {},
                        ]}
                    >
                        {column.label}
                    </Text>
                ))}
            </View>
            {rows.map((row, index) => (
                <View
                    key={index}
                    style={[styles.row, index % 2 === 1 ? styles.zebra : {}]}
                    wrap={false}
                >
                    {columns.map((column, cellIndex) => {
                        const value = String(row[cellIndex] ?? '');
                        if (column.badge && value) {
                            return (
                                <View
                                    key={column.label}
                                    style={[
                                        styles.badgeCell,
                                        { width: widthOf(column) },
                                    ]}
                                >
                                    <PdfBadge
                                        tone={column.badge(value)}
                                        label={value}
                                    />
                                </View>
                            );
                        }
                        return (
                            <Text
                                key={column.label}
                                style={[
                                    styles.cell,
                                    compact ? styles.compact : {},
                                    { width: widthOf(column) },
                                    column.align === 'right'
                                        ? styles.right
                                        : {},
                                    column.bold ? styles.bold : {},
                                    column.muted ? styles.mutedCell : {},
                                ]}
                            >
                                {value}
                            </Text>
                        );
                    })}
                </View>
            ))}
        </View>
    );
};
