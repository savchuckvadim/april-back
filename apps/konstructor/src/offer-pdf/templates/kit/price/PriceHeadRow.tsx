import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import type { PriceColumn } from './price-columns.util';
import { priceStyles } from './price.styles';
import { PriceCell } from './PriceCell';

export interface PriceHeadRowProps {
    columns: PriceColumn[];
    theme: OfferPdfTheme;
}

/** Шапка таблицы цен */
export const PriceHeadRow: FC<PriceHeadRowProps> = ({ columns, theme }) => {
    const styles = priceStyles(theme);
    return (
        <View style={[styles.row, styles.rowHead]}>
            {columns.map((column, index) => (
                <PriceCell
                    key={column.title}
                    width={column.width}
                    theme={theme}
                    last={index === columns.length - 1}
                >
                    <Text style={styles.cellHead}>{column.title}</Text>
                </PriceCell>
            ))}
        </View>
    );
};
