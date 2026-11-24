import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { IProductRenderItemData } from '@app/konstructor/offer-word/services/render-data-services/offer-render-price.service';
import { sx } from '../../shared/style.util';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import {
    NAME_COLUMN_INDEX,
    priceRowValues,
    type PriceColumn,
} from './price-columns.util';
import { TOTALS_PRESENCE } from './price.layout';
import { priceStyles } from './price.styles';
import { PriceCell } from './PriceCell';

export interface PriceProductRowProps {
    row: IProductRenderItemData;
    index: number;
    columns: PriceColumn[];
    withDiscount: boolean;
    /** Последняя строка: нижняя рамка и место под итог на том же листе */
    last: boolean;
    theme: OfferPdfTheme;
}

/** Строка товара: номер, название с поставкой, количество, цены */
export const PriceProductRow: FC<PriceProductRowProps> = ({
    row,
    index,
    columns,
    withDiscount,
    last,
    theme,
}) => {
    const styles = priceStyles(theme);
    const values = priceRowValues(row, index, withDiscount);

    return (
        <View
            style={sx(styles.row, last && styles.rowLast)}
            wrap={false}
            minPresenceAhead={last ? TOTALS_PRESENCE : undefined}
        >
            {columns.map((column, columnIndex) => (
                <PriceCell
                    key={column.title}
                    width={column.width}
                    theme={theme}
                    last={columnIndex === columns.length - 1}
                >
                    {columnIndex === NAME_COLUMN_INDEX ? (
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
                </PriceCell>
            ))}
        </View>
    );
};
