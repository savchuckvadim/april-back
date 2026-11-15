import type { FC, ReactNode } from 'react';
import { View } from '@react-pdf/renderer';
import { sx } from '../../shared/style.util';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { priceStyles } from './price.styles';

export interface PriceCellProps {
    width: string;
    theme: OfferPdfTheme;
    /** Последняя колонка — без правой линии */
    last?: boolean;
    children: ReactNode;
}

/** Ячейка таблицы цен заданной ширины */
export const PriceCell: FC<PriceCellProps> = ({
    width,
    theme,
    last,
    children,
}) => {
    const styles = priceStyles(theme);
    return (
        <View style={sx(styles.cell, last && styles.cellLast, { width })}>
            {children}
        </View>
    );
};
