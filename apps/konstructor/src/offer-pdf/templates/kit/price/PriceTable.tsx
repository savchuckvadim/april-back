import type { FC, ReactElement } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { IProductRenderItemData } from '@app/konstructor/offer-word/services/render-data-services/offer-render-price.service';
import { OfferPdfDocumentModel } from '../../../model/offer-pdf-document.model';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { hasDiscount, priceColumns } from './price-columns.util';
import { hasSetTitle } from './price-set-title.util';
import { SMALL_TABLE_ROWS, TOTALS_PRESENCE } from './price.layout';
import { priceStyles } from './price.styles';
import { PriceHeadRow } from './PriceHeadRow';
import { PriceProductRow } from './PriceProductRow';
import { PriceSetTitleRow } from './PriceSetTitleRow';
import { PriceTotals } from './PriceTotals';

export interface PriceTableProps {
    model: OfferPdfDocumentModel;
    theme: OfferPdfTheme;
}

/** Таблица цен по строкам КП, итог и фраза об акции */
export const PriceTable: FC<PriceTableProps> = ({ model, theme }) => {
    const { data, settings } = model;
    const styles = priceStyles(theme);
    const rows = data.ProductRows ?? [];
    const withDiscount = hasDiscount(rows);
    const columns = priceColumns(withDiscount);
    const total = data.TotalRow?.[0];
    const [first, ...rest] = rows;
    const isLast = (index: number): boolean => index === rows.length - 1;
    const productRowAt = (
        row: IProductRenderItemData,
        index: number,
    ): ReactElement => (
        <PriceProductRow
            key={index}
            row={row}
            index={index}
            columns={columns}
            withDiscount={withDiscount}
            last={isLast(index)}
            theme={theme}
        />
    );
    const setTitleAt = (row: IProductRenderItemData): ReactElement => (
        <PriceSetTitleRow title={row.ProductSetTitle} theme={theme} />
    );

    return (
        // Короткая таблица не рвётся между страницами: уходит на новую вместе с итогом
        <View style={styles.table} wrap={rows.length > SMALL_TABLE_ROWS}>
            {/* Шапка таблицы — вместе с первой строкой (и заголовком её набора): одна внизу страницы она не остаётся */}
            <View
                wrap={false}
                minPresenceAhead={isLast(0) ? TOTALS_PRESENCE : undefined}
            >
                <PriceHeadRow columns={columns} theme={theme} />
                {first && hasSetTitle(first) ? setTitleAt(first) : null}
                {first ? productRowAt(first, 0) : null}
            </View>
            {rest.map((row, offset) => {
                const index = offset + 1;
                // заголовок набора для сравнения и первая строка набора — один небольшой неделимый блок: заголовок не остаётся последним на листе (break и крупные неделимые блоки разбивку зацикливают)
                return hasSetTitle(row) ? (
                    <View
                        key={index}
                        wrap={false}
                        minPresenceAhead={
                            isLast(index) ? TOTALS_PRESENCE : undefined
                        }
                    >
                        {setTitleAt(row)}
                        {productRowAt(row, index)}
                    </View>
                ) : (
                    productRowAt(row, index)
                );
            })}
            {total ? <PriceTotals total={total} theme={theme} /> : null}
            {settings.salePhrase ? (
                <Text style={styles.salePhrase}>{settings.salePhrase}</Text>
            ) : null}
        </View>
    );
};
