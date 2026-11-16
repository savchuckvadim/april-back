import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { OfferPdfDocumentModel } from '../../../model/offer-pdf-document.model';
import { baseStyles } from '../base.styles';
import { onSurface } from '../document/surface.styles';
import { SurfaceGate } from '../document/SurfaceGate';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { hasDiscount, priceColumns } from './price-columns.util';
import { SMALL_TABLE_ROWS, TOTALS_PRESENCE } from './price.layout';
import { priceStyles } from './price.styles';
import { PriceHeadRow } from './PriceHeadRow';
import { PriceProductRow } from './PriceProductRow';
import { PriceTotals } from './PriceTotals';

export interface OfferPriceProps {
    model: OfferPdfDocumentModel;
    theme: OfferPdfTheme;
}

/** Таблица цен по строкам КП, итог и фраза об акции. */
export const OfferPrice: FC<OfferPriceProps> = ({ model, theme }) => {
    const { data, settings } = model;
    const styles = priceStyles(theme);
    const base = baseStyles(theme);
    const rows = data.ProductRows ?? [];
    const withDiscount = hasDiscount(rows);
    const columns = priceColumns(withDiscount);
    const total = data.TotalRow?.[0];
    const caption =
        data.GeneralProductByContractName || data.GeneralProductName;
    const [first, ...rest] = rows;
    const isLast = (index: number): boolean => index === rows.length - 1;

    return (
        <>
            <SurfaceGate theme={theme} />
            <View style={onSurface(theme, base.section)}>
                <Text style={base.h2} minPresenceAhead={80}>
                    Стоимость
                </Text>
                {caption ? <Text style={base.caption}>{caption}</Text> : null}

                {/* Короткая таблица не рвётся между страницами: уходит на новую вместе с итогом */}
                <View
                    style={styles.table}
                    wrap={rows.length > SMALL_TABLE_ROWS}
                >
                    {/* Шапка таблицы — вместе с первой строкой: одна внизу страницы она не остаётся */}
                    <View
                        wrap={false}
                        minPresenceAhead={
                            isLast(0) ? TOTALS_PRESENCE : undefined
                        }
                    >
                        <PriceHeadRow columns={columns} theme={theme} />
                        {first ? (
                            <PriceProductRow
                                row={first}
                                index={0}
                                columns={columns}
                                withDiscount={withDiscount}
                                last={isLast(0)}
                                theme={theme}
                            />
                        ) : null}
                    </View>
                    {rest.map((row, offset) => (
                        <PriceProductRow
                            key={offset + 1}
                            row={row}
                            index={offset + 1}
                            columns={columns}
                            withDiscount={withDiscount}
                            last={isLast(offset + 1)}
                            theme={theme}
                        />
                    ))}
                    {total ? <PriceTotals total={total} theme={theme} /> : null}
                    {settings.salePhrase ? (
                        <Text style={styles.salePhrase}>
                            {settings.salePhrase}
                        </Text>
                    ) : null}
                </View>
            </View>
        </>
    );
};
