import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { infoblocksStyles } from './infoblocks.styles';

export interface GroupHeadProps {
    name: string;
    theme: OfferPdfTheme;
}

/** Шапка группы в таблице — строка на всю ширину с подложкой */
export const GroupHead: FC<GroupHeadProps> = ({ name, theme }) => {
    const styles = infoblocksStyles(theme);
    return (
        <View style={[styles.tr, styles.trGroup]} wrap={false}>
            <View style={[styles.td, styles.tdFill, styles.tdLast]}>
                <Text style={styles.groupCell}>{name}</Text>
            </View>
        </View>
    );
};
