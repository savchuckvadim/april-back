import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { IInfblockRenderData } from '@app/konstructor/document-generate/infoblocks/infoblock-render-data.service';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { infoblocksStyles } from './infoblocks.styles';

export interface ListNamesRowProps {
    /** Одно или два названия */
    pair: readonly IInfblockRenderData[];
    theme: OfferPdfTheme;
}

/** Строка списка без описаний: два названия рядом, строка не рвётся */
export const ListNamesRow: FC<ListNamesRowProps> = ({ pair, theme }) => {
    const styles = infoblocksStyles(theme);
    return (
        <View style={styles.namesRow} wrap={false}>
            {pair.map(infoblock => (
                <View key={infoblock.name} style={styles.namesCell}>
                    <Text style={styles.itemName}>{infoblock.name}</Text>
                </View>
            ))}
        </View>
    );
};
