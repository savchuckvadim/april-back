import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { IProductRenderItemData } from '@app/konstructor/offer-word/services/render-data-services/offer-render-price.service';
import { sx } from '../../templates/shared/style.util';
import type { OfferPdfTheme } from '../../templates/kit/theme/offer-pdf-theme';
import { PriceCell } from '../../templates/kit/price/PriceCell';
import { PriceHeadRow } from '../../templates/kit/price/PriceHeadRow';
import {
    NAME_COLUMN_INDEX,
    hasDiscount,
    priceColumns,
    priceRowValues,
} from '../../templates/kit/price/price-columns.util';
import { priceStyles } from '../../templates/kit/price/price.styles';
import type { InvoicePdfModel } from '../model/invoice-pdf.model';
import { invoiceStyles } from './invoice-pdf.styles';

export interface InvoiceTableProps {
    model: InvoicePdfModel;
    theme: OfferPdfTheme;
}

/** Название позиции счёта: с формулировкой договора, как в Word-счёте. */
export const invoiceRowName = (row: IProductRenderItemData): string =>
    row.ProductByContractName || row.ProductName;

/**
 * Таблица позиций счёта. Колонки и значения те же, что у таблицы цен КП
 * (`price-columns.util`). Колонка «Скидка» стоит, когда скидка есть у строк,
 * независимо от настройки КП `showDiscount`: счёт показывает её всегда.
 */
export const InvoiceTable: FC<InvoiceTableProps> = ({ model, theme }) => {
    const rows = model.data.ProductRows ?? [];
    const withDiscount = hasDiscount(rows);
    const columns = priceColumns(withDiscount);
    const price = priceStyles(theme);
    const styles = invoiceStyles(theme);
    const lastIndex = rows.length - 1;

    const rowAt = (row: IProductRenderItemData, index: number) => {
        const values = priceRowValues(row, index, withDiscount);
        return (
            <View
                key={index}
                style={sx(price.row, index === lastIndex && price.rowLast)}
                wrap={false}
            >
                {columns.map((column, columnIndex) => (
                    <PriceCell
                        key={column.title}
                        width={column.width}
                        theme={theme}
                        last={columnIndex === columns.length - 1}
                    >
                        <Text
                            style={
                                columnIndex === NAME_COLUMN_INDEX
                                    ? price.cellTextLeft
                                    : price.cellText
                            }
                        >
                            {columnIndex === NAME_COLUMN_INDEX
                                ? invoiceRowName(row)
                                : (values[columnIndex] ?? '')}
                        </Text>
                    </PriceCell>
                ))}
            </View>
        );
    };

    const [first, ...rest] = rows;
    return (
        <View style={styles.tableBlock}>
            {/* шапка таблицы идёт вместе с первой строкой: одна внизу листа она не остаётся */}
            <View wrap={false}>
                <PriceHeadRow columns={columns} theme={theme} />
                {first ? rowAt(first, 0) : null}
            </View>
            {rest.map((row, offset) => rowAt(row, offset + 1))}
        </View>
    );
};
