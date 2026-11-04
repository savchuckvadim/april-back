import type { FC, ReactNode } from 'react';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import { IProductRenderItemData } from '@app/konstructor/offer-word/services/render-data-services/offer-render-price.service';
import { OfferPdfDocumentModel } from '../../../model/offer-pdf-document.model';
import { sx } from '../../shared/style.util';
import { classicStyles } from '../classic.styles';
import { CLASSIC_THEME } from '../classic.theme';
import { parseAmount } from '../classic.util';

const { colors, sizes } = CLASSIC_THEME;

const FRAME = 0.75;
const GRID = 0.5;

/**
 * Рамка таблицы нарисована на строках, а не на обёртке: так итог живёт в
 * одном потоке со строками, и при разрыве страницы последняя строка
 * уходит вместе с ним (minPresenceAhead), а не «Итого» одно на новом листе.
 */
const styles = StyleSheet.create({
    table: { marginTop: 6 },
    row: {
        flexDirection: 'row',
        borderLeftWidth: FRAME,
        borderRightWidth: FRAME,
        borderColor: colors.tableBorder,
    },
    rowHead: {
        backgroundColor: colors.shade,
        borderTopWidth: FRAME,
        borderTopColor: colors.tableBorder,
    },
    rowLast: { borderBottomWidth: FRAME - GRID, borderBottomColor: colors.tableBorder },
    cell: {
        paddingVertical: 4,
        paddingHorizontal: 4,
        borderRightWidth: GRID,
        borderRightColor: colors.tableBorder,
        borderBottomWidth: GRID,
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

/** Сколько места держать под итог после последней строки таблицы */
const TOTALS_PRESENCE = 90;
/** Таблицу до стольких строк не делим между страницами */
const SMALL_TABLE_ROWS = 3;

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

const HeadRow: FC<{ columns: Column[] }> = ({ columns }) => (
    <View style={[styles.row, styles.rowHead]}>
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
);

const rowValues = (
    row: IProductRenderItemData,
    index: number,
    withDiscount: boolean,
): Array<string | null> => [
    row.ProductNumber || String(index + 1),
    null,
    row.ProductQuantity,
    row.ProductMeasure,
    withDiscount ? row.ProductPriceDefault || row.ProductPrice : row.ProductPrice,
    ...(withDiscount
        ? [
              parseAmount(row.ProductDiscountPercent) > 0
                  ? `${row.ProductDiscountPercent} %`
                  : '—',
          ]
        : []),
    row.ProductSum,
];

interface ProductRowProps {
    row: IProductRenderItemData;
    index: number;
    columns: Column[];
    withDiscount: boolean;
    last: boolean;
}

const ProductRow: FC<ProductRowProps> = ({ row, index, columns, withDiscount, last }) => {
    const values = rowValues(row, index, withDiscount);
    return (
        <View
            style={sx(styles.row, last && styles.rowLast)}
            wrap={false}
            minPresenceAhead={last ? TOTALS_PRESENCE : undefined}
        >
            {columns.map((column, columnIndex) => (
                <Cell
                    key={column.title}
                    width={column.width}
                    last={columnIndex === columns.length - 1}
                >
                    {columnIndex === 1 ? (
                        <>
                            <Text style={styles.cellTextLeft}>{row.ProductName}</Text>
                            {row.SupplyNameMarketing ? (
                                <Text style={styles.sub}>{row.SupplyNameMarketing}</Text>
                            ) : null}
                        </>
                    ) : (
                        <Text style={styles.cellText}>{values[columnIndex] ?? ''}</Text>
                    )}
                </Cell>
            ))}
        </View>
    );
};

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
    const [first, ...rest] = rows;
    const isLast = (index: number): boolean => index === rows.length - 1;

    return (
        <View style={classicStyles.section}>
            <Text style={classicStyles.h2} minPresenceAhead={80}>
                Стоимость
            </Text>
            {caption ? (
                <Text style={classicStyles.caption}>{caption}</Text>
            ) : null}

            {/* Короткая таблица не рвётся между страницами: уходит на новую вместе с итогом */}
            <View style={styles.table} wrap={rows.length > SMALL_TABLE_ROWS}>
                {/* Шапка таблицы — вместе с первой строкой: одна внизу страницы она не остаётся */}
                <View wrap={false} minPresenceAhead={isLast(0) ? TOTALS_PRESENCE : undefined}>
                    <HeadRow columns={columns} />
                    {first ? (
                        <ProductRow
                            row={first}
                            index={0}
                            columns={columns}
                            withDiscount={withDiscount}
                            last={isLast(0)}
                        />
                    ) : null}
                </View>
                {rest.map((row, offset) => (
                    <ProductRow
                        key={offset + 1}
                        row={row}
                        index={offset + 1}
                        columns={columns}
                        withDiscount={withDiscount}
                        last={isLast(offset + 1)}
                    />
                ))}

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
        </View>
    );
};
