import type { FC, ReactNode } from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import { OfferPdfDocumentModel } from '../../../model/offer-pdf-document.model';
import { sx } from '../../shared/style.util';
import { classicStyles } from '../classic.styles';
import { CLASSIC_THEME } from '../classic.theme';
import { parseAmount } from '../classic.util';

const { colors, sizes } = CLASSIC_THEME;

const styles = StyleSheet.create({
    table: {
        marginTop: 6,
        borderWidth: 0.75,
        borderColor: colors.tableBorder,
    },
    row: { flexDirection: 'row' },
    rowHead: { flexDirection: 'row', backgroundColor: colors.shade },
    cell: {
        paddingVertical: 4,
        paddingHorizontal: 4,
        borderRightWidth: 0.5,
        borderRightColor: colors.tableBorder,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.tableBorder,
        justifyContent: 'center',
    },
    cellLast: { borderRightWidth: 0 },
    cellHead: { fontSize: sizes.sm, fontWeight: 'bold', textAlign: 'center' },
    cellText: { fontSize: sizes.sm, textAlign: 'center' },
    cellTextLeft: { fontSize: sizes.sm, textAlign: 'left' },
    sub: { fontSize: sizes.xs, color: colors.muted, marginTop: 1 },
    totals: { marginTop: 8, alignItems: 'flex-end' },
    totalLine: { fontSize: sizes.lg },
    totalSub: { fontSize: sizes.sm, color: colors.muted, textAlign: 'right' },
    salePhrase: {
        marginTop: 8,
        fontSize: sizes.base,
        fontStyle: 'italic',
        color: colors.accent,
    },
});

interface Column {
    title: string;
    width: string;
}

const columnsFor = (withDiscount: boolean): Column[] => [
    { title: '№', width: '6%' },
    { title: 'Наименование', width: withDiscount ? '40%' : '49%' },
    { title: 'Кол-во', width: '10%' },
    { title: 'Ед.', width: '9%' },
    { title: 'Цена', width: '13%' },
    ...(withDiscount ? [{ title: 'Скидка', width: '9%' }] : []),
    { title: 'Сумма', width: '13%' },
];

const Cell: FC<{ width: string; last?: boolean; children: ReactNode }> = ({
    width,
    last,
    children,
}) => (
    <View style={sx(styles.cell, last && styles.cellLast, { width })}>
        {children}
    </View>
);

/** Таблица цен по строкам КП, итог и фраза об акции. */
export const ClassicPrice: FC<{ model: OfferPdfDocumentModel }> = ({
    model,
}) => {
    const { data, settings } = model;
    const rows = data.ProductRows ?? [];
    const withDiscount = rows.some(
        row => parseAmount(row.ProductDiscountPercent) > 0,
    );
    const columns = columnsFor(withDiscount);
    const total = data.TotalRow?.[0];
    const caption =
        data.GeneralProductByContractName || data.GeneralProductName;

    return (
        <View style={classicStyles.section}>
            <Text style={classicStyles.h2} minPresenceAhead={80}>
                Стоимость
            </Text>
            {caption ? (
                <Text style={classicStyles.caption}>{caption}</Text>
            ) : null}

            <View style={styles.table}>
                <View style={styles.rowHead} wrap={false}>
                    {columns.map((column, index) => (
                        <Cell
                            key={column.title}
                            width={column.width}
                            last={index === columns.length - 1}
                        >
                            <Text style={styles.cellHead}>{column.title}</Text>
                        </Cell>
                    ))}
                </View>
                {rows.map((row, index) => {
                    const values = [
                        row.ProductNumber || String(index + 1),
                        null,
                        row.ProductQuantity,
                        row.ProductMeasure,
                        withDiscount
                            ? row.ProductPriceDefault || row.ProductPrice
                            : row.ProductPrice,
                        ...(withDiscount
                            ? [
                                  parseAmount(row.ProductDiscountPercent) > 0
                                      ? `${row.ProductDiscountPercent} %`
                                      : '—',
                              ]
                            : []),
                        row.ProductSum,
                    ];
                    return (
                        <View key={index} style={styles.row} wrap={false}>
                            {columns.map((column, columnIndex) => (
                                <Cell
                                    key={column.title}
                                    width={column.width}
                                    last={columnIndex === columns.length - 1}
                                >
                                    {columnIndex === 1 ? (
                                        <>
                                            <Text style={styles.cellTextLeft}>
                                                {row.ProductName}
                                            </Text>
                                            {row.SupplyNameMarketing ? (
                                                <Text style={styles.sub}>
                                                    {row.SupplyNameMarketing}
                                                </Text>
                                            ) : null}
                                        </>
                                    ) : (
                                        <Text style={styles.cellText}>
                                            {values[columnIndex] ?? ''}
                                        </Text>
                                    )}
                                </Cell>
                            ))}
                        </View>
                    );
                })}
            </View>

            {total ? (
                <View style={styles.totals} wrap={false}>
                    <Text style={styles.totalLine}>
                        <Text style={classicStyles.bold}>Итого: </Text>
                        {total.TotalSum}
                    </Text>
                    {total.TotalMonthSum ? (
                        <Text style={styles.totalSub}>
                            В месяц: {total.TotalMonthSum}
                        </Text>
                    ) : null}
                    {total.TotalTaxInvoiceInfo ? (
                        <Text style={styles.totalSub}>
                            {total.TotalTaxInvoiceInfo}
                        </Text>
                    ) : null}
                    {total.TotalSumString ? (
                        <Text style={styles.totalSub}>
                            Сумма прописью: {total.TotalSumString}
                        </Text>
                    ) : null}
                </View>
            ) : null}

            {settings.salePhrase ? (
                <Text style={styles.salePhrase}>{settings.salePhrase}</Text>
            ) : null}
        </View>
    );
};
