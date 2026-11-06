import type { FC } from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import { OWNER_PDF_THEME } from './owner-report-pdf.styles';

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
    headCell: { fontSize: sizes.xs, color: colors.muted, paddingRight: 4 },
    cell: { fontSize: sizes.sm, paddingRight: 4 },
    right: { textAlign: 'right' },
    bold: { fontWeight: 'bold' },
    mutedCell: { color: colors.muted },
});

/** Колонка таблицы: подпись, ширина (доля) и выравнивание. */
export interface PdfColumn {
    label: string;
    /** Ширина в долях от ширины таблицы (сумма — любая, нормализуется). */
    width: number;
    align?: 'left' | 'right';
    muted?: boolean;
    bold?: boolean;
}

interface OwnerReportPdfTableProps {
    columns: readonly PdfColumn[];
    rows: readonly (readonly (string | number)[])[];
}

/** Простая таблица: строки — массивы ячеек по колонкам; длинные строки переносятся. */
export const OwnerReportPdfTable: FC<OwnerReportPdfTableProps> = ({
    columns,
    rows,
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
                <View key={index} style={styles.row} wrap={false}>
                    {columns.map((column, cellIndex) => (
                        <Text
                            key={column.label}
                            style={[
                                styles.cell,
                                { width: widthOf(column) },
                                column.align === 'right' ? styles.right : {},
                                column.bold ? styles.bold : {},
                                column.muted ? styles.mutedCell : {},
                            ]}
                        >
                            {String(row[cellIndex] ?? '')}
                        </Text>
                    ))}
                </View>
            ))}
        </View>
    );
};
